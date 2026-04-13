import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — HEALTHREACH" },
      { name: "description", content: "Get in touch with HEALTHREACH. We'd love to hear from you." },
      { property: "og:title", content: "Contact Us — HEALTHREACH" },
      { property: "og:description", content: "Have questions about our healthcare platform? Reach out and we'll get back to you." },
    ],
  }),
  component: ContactPage,
});

const contactInfo = [
  { icon: Mail, label: "Email", value: "info@healthreach.co.za" },
  { icon: Phone, label: "Phone", value: "+27 (0) 11 000 0000" },
  { icon: MapPin, label: "Address", value: "Johannesburg, South Africa" },
];

function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

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
              {submitted ? (
                <div className="healthcare-card p-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-healthcare-green/20">
                    <Mail className="h-6 w-6 text-healthcare-green" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">Message Sent!</h3>
                  <p className="mt-2 text-muted-foreground">
                    Thank you for reaching out. We'll get back to you within 24 hours.
                  </p>
                  <Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="healthcare-card p-8 space-y-5">
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
                    Send Message
                  </Button>
                </form>
              )}
            </div>

            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-2xl font-bold text-foreground">Get in Touch</h2>
              <p className="text-muted-foreground">
                Reach out to us through any of the channels below and our team will respond promptly.
              </p>
              <div className="space-y-4">
                {contactInfo.map((item) => (
                  <div key={item.label} className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
