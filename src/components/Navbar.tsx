import type { FC } from 'react'

const navItems = ['Features', 'How It Works', 'Pricing', 'Demo'] as const

interface NavbarProps {
  isHidden?: boolean
  activeTab?: string
  onItemClick?: (item: string) => void
}

const Navbar: FC<NavbarProps> = ({ isHidden = false, activeTab = 'Features', onItemClick }) => {
  return (
    <nav
      id="main-nav"
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-between p-4 sm:p-5 transition-opacity duration-700 ${
        isHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Wordmark */}
      <span className="text-white text-xl font-syne font-bold">
        Virtual<span className="text-[#6366f1]">Realty</span>
      </span>

      {/* Center navigation pill */}
      <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-2 py-2 items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item}
            id={`nav-${item.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => onItemClick && onItemClick(item)}
            className={`${
              item === activeTab
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            } transition-all duration-300 px-4 py-1.5 rounded-full text-sm font-medium`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* CTA */}
      <button
        id="nav-cta"
        className="bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-all"
      >
        Get Started Free
      </button>
    </nav>
  )
}

export default Navbar
