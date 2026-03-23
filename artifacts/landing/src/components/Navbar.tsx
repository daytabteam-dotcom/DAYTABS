import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMenuOpen(false);
    if (href.startsWith("#")) {
      if (location === "/") {
        const el = document.querySelector(href);
        el?.scrollIntoView({ behavior: "smooth" });
      } else {
        navigate("/" + href);
      }
    } else {
      navigate(href);
    }
  };

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass border-b border-white/10 shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
          <img src="/images/logo.jpg" alt="DayTabs" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-bold text-lg gradient-text">DayTabs</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => handleNavClick(link.href)}
              className="text-sm text-white/70 hover:text-white transition-colors cursor-pointer"
              data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" data-testid="link-login">
            <button className="px-4 py-2 text-sm text-white/80 hover:text-white transition-colors cursor-pointer">
              Login
            </button>
          </Link>
          <Link href="/signup" data-testid="link-signup">
            <button className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-500 text-white rounded-xl hover:from-violet-500 hover:to-purple-400 transition-all shadow-lg shadow-violet-500/25 cursor-pointer">
              Get Started
            </button>
          </Link>
        </div>

        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-mobile-menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-white/10 px-6 py-4 flex flex-col gap-4"
          >
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="text-sm text-white/70 hover:text-white transition-colors text-left cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <Link href="/login" className="flex-1">
                <button className="w-full px-4 py-2 text-sm text-white/80 border border-white/20 rounded-xl hover:border-white/40 transition-all cursor-pointer">
                  Login
                </button>
              </Link>
              <Link href="/signup" className="flex-1">
                <button className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-500 text-white rounded-xl cursor-pointer">
                  Get Started
                </button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
