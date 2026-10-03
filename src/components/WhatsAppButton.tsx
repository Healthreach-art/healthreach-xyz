import { MessageCircle } from "lucide-react";

const WA_LINK = `https://wa.me/27797285078?text=${encodeURIComponent("Hi HealthReachCare, I'd like to ask a quick question.")}`;

export function WhatsAppButton() {
  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with HealthReachCare on WhatsApp"
      className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-6"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
}
