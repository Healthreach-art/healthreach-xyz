-- ============================================================
-- Phase 1: Reusable Paystack authorizations on saved cards
-- ============================================================
ALTER TABLE public.saved_payment_methods
  ADD COLUMN IF NOT EXISTS authorization_code text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS card_type text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS reusable boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS saved_payment_methods_user_signature_uniq
  ON public.saved_payment_methods (user_id, signature)
  WHERE signature IS NOT NULL;

-- Service role needs to write authorization codes via server functions
GRANT ALL ON public.saved_payment_methods TO service_role;

-- ============================================================
-- Phase 2: Wallet + atomic credit/debit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet"
  ON public.wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all wallets"
  ON public.wallets FOR SELECT
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL CHECK (reason IN ('topup','order_payment','refund','adjustment')),
  order_id uuid,
  paystack_reference text,
  balance_after_cents bigint NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_paystack_ref_uniq
  ON public.wallet_transactions(paystack_reference)
  WHERE paystack_reference IS NOT NULL;

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic credit
CREATE OR REPLACE FUNCTION public.wallet_credit(
  _user_id uuid,
  _amount_cents bigint,
  _reason text,
  _order_id uuid DEFAULT NULL,
  _paystack_reference text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- Dedupe by paystack_reference if provided
  IF _paystack_reference IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE paystack_reference = _paystack_reference) THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
  END IF;

  INSERT INTO public.wallets (user_id, balance_cents)
  VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _user_id FOR UPDATE;

  UPDATE public.wallets
     SET balance_cents = balance_cents + _amount_cents,
         updated_at = now()
   WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (wallet_id, user_id, direction, amount_cents, reason, order_id, paystack_reference, balance_after_cents, note)
  VALUES (v_wallet.id, _user_id, 'credit', _amount_cents, _reason, _order_id, _paystack_reference, v_wallet.balance_cents + _amount_cents, _note)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx_id, 'balance_cents', v_wallet.balance_cents + _amount_cents);
END;
$$;

-- Atomic debit (refuses overdraft)
CREATE OR REPLACE FUNCTION public.wallet_debit(
  _user_id uuid,
  _amount_cents bigint,
  _reason text,
  _order_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_tx_id uuid;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_wallet.balance_cents < _amount_cents THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  UPDATE public.wallets
     SET balance_cents = balance_cents - _amount_cents,
         updated_at = now()
   WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (wallet_id, user_id, direction, amount_cents, reason, order_id, balance_after_cents, note)
  VALUES (v_wallet.id, _user_id, 'debit', _amount_cents, _reason, _order_id, v_wallet.balance_cents - _amount_cents, _note)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx_id, 'balance_cents', v_wallet.balance_cents - _amount_cents);
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_credit(uuid, bigint, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_debit(uuid, bigint, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_credit(uuid, bigint, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_debit(uuid, bigint, text, uuid, text) TO service_role;