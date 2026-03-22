import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MessageSquare, User, Send, CheckCircle, AlertCircle } from "lucide-react";
import Navbar from "../components/Navbar";
import { authApi } from "../lib/api";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.contact(name, email, message);
      setSuccess(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/30">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4">
              Get in <span className="gradient-text">Touch</span>
            </h1>
            <p className="text-white/50 text-lg">
              Have a question or want to learn more? We'd love to hear from you.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass rounded-3xl p-8 border border-white/10 shadow-2xl"
          >
            {success ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
                data-testid="text-contact-success"
              >
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                <p className="text-white/50">
                  Thank you for reaching out. We'll get back to you as soon as possible.
                </p>
                <button
                  onClick={() => setSuccess(false)}
                  className="mt-6 px-6 py-2 glass border border-white/15 rounded-xl text-sm hover:border-violet-500/40 transition-all cursor-pointer"
                >
                  Send another message
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3" data-testid="text-contact-error">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 transition-all"
                      placeholder="Jane Doe"
                      data-testid="input-contact-name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 transition-all"
                      placeholder="you@example.com"
                      data-testid="input-contact-email"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-1.5">Message</label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3.5 w-4 h-4 text-white/30" />
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      rows={5}
                      className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/60 transition-all resize-none"
                      placeholder="Tell us what's on your mind..."
                      data-testid="input-contact-message"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-500 text-white text-sm font-semibold rounded-xl hover:from-violet-500 hover:to-purple-400 transition-all shadow-lg shadow-violet-500/25 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  data-testid="button-contact-submit"
                >
                  {loading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
