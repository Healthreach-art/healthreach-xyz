import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin, MessageCircle, User } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — HealthReachCare" },
      { name: "description", content: "Get in touch with HealthReachCare. We'd love to hear from you." },
      { property: "og:title", content: "Contact Us — HealthReachCare" },
      { property: "og:description", content: "Have questions about our healthcare platform? Reach out and we'll get back to you." },
      { property: "og:url", content: "https://healthreachcare.co.za/contact" },
    ],
    links: [{ rel: "canonical", href: "https://healthreachcare.co.za/contact" }],
  }),
  component: ContactPage,
});

const WHATSAPP_NUMBER = "27797285078"; // +27 79 728 5078 in wa.me format
const PHONE_DISPLAY = "+27 79 728 5078";

const contactInfo = [
  { icon: User, label: "Contact Person", value: "Nicole Barkhuisen" },
  { icon: Phone, label: "Phone", value: PHONE_DISPLAY, href: "tel:+27797285078" },
  { icon: Mail, label: "Email", value: "support@healthreachcare.co.za", href: "mailto:support@healthreachcare.co.za" },
  { icon: MessageCircle, label: "WhatsApp", value: `Chat on WhatsApp (${PHONE_DISPLAY})`, href: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi HealthReachCare, I'd like to ask a quick question.")}` },
  { icon: MapPin, label: "Address", value: "Cape Town, South Africa" },
];

function ContactPage() {
  return (
    <div>
      <section className="section-padding healthcare-gradient">
        <div className="container-narrow text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-primary-foreground">Contact Us</h1>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
            Have a question or want to learn more? We'd love to hear from you.
          </p>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="container-narrow">
          <div className="grid gap-12 lg:grid-cols-5">
            <div className="lg:col-span-3">
                <form action="mailto:support@healthreachcare.co.za" method="post" encType="text/plain" className="healthcare-card p-8 space-y-5">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Send us a message</h2>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" placeholder="John Doe" required maxLength={100} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="john@example.com" required maxLength={255} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input id="subject" placeholder="How can we help?" required maxLength={200} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea id="message" placeholder="Tell us more..." rows={5} required maxLength={1000} />
                  </div>
                  <Button type="submit" size="lg" className="w-full sm:w-auto">
                    Open Email App
                  </Button>
                  <p className="text-sm text-muted-foreground">Your email app will open with this message. It is only sent after you confirm there.</p>
                </form>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-2xl font-bold text-foreground">Get in Touch</h2>
              <p className="text-muted-foreground">
                Reach out to us through any of the channels below and our team will respond promptly.
              </p>
              <div className="space-y-4">
                {contactInfo.map((item) => {
                  const inner = (
                    <>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <item.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.label}</div>
                        <div className="text-sm text-muted-foreground">{item.value}</div>
                      </div>
                    </>
                  );
                  return item.href ? (
                    <a key={item.label} href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="flex items-start gap-4 group hover:opacity-80 transition">
                      {inner}
                    </a>
                  ) : (
                    <div key={item.label} className="flex items-start gap-4">{inner}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
