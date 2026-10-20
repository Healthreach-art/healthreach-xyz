import { MessageCircle } from "lucide-react";

const WA_NUMBER = "27797285078";
const WA_TEXT = "Hi HealthReachCare, I'd like some help.";

export function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_TEXT)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with HealthReachCare on WhatsApp"
      className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green text-primary-foreground shadow-xl transition-transform hover:scale-105 md:bottom-6"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
