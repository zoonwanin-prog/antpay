import Link from "next/link";
import type { ReactNode } from "react";
import type { Route } from "next";
import {
  BanknoteArrowDown,
  Bitcoin,
  CloudUpload,
  ClipboardCheck,
  FileText,
  KeyRound,
  LayoutDashboard,
  Landmark,
  ListFilter,
  LogOut,
  Menu,
  PieChart,
  ReceiptText,
  Settings,
  Search,
  ShieldCheck,
  User,
  Wallet,
  WalletCards,
  Zap
} from "lucide-react";

type NavKey =
  | "dashboard"
  | "transfers"
  | "crypto"
  | "balances"
  | "statements"
  | "expenses"
  | "bogo2pay"
  | "safewallet"
  | "summary"
  | "audit"
  | "settingsAccounts"
  | "settingsSystem"
  | "statementUpload"
  | "statementSearch"
  | "bulkStatus";

type AdminShellProps = {
  active: NavKey;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

const navGroups = [
  {
    label: "หน้าหลัก",
    items: [{ key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    label: "รายการเดินบัญชี",
    items: [
      { key: "transfers", href: "/transfers", label: "โยกเงิน", icon: BanknoteArrowDown },
      { key: "crypto", href: "/crypto", label: "คริปโต", icon: Bitcoin },
      { key: "balances", href: "/balances", label: "ยอดคงเหลือ", icon: Wallet },
      { key: "statements", href: "/statements", label: "สเตทเม้นธนาคาร", icon: FileText },
      { key: "statementUpload", href: "/statements/upload", label: "อัปโหลด Statement", icon: CloudUpload },
      { key: "statementSearch", href: "/statements/search", label: "ค้นหาจาก Statement", icon: Search },
      { key: "bulkStatus", href: "/statements/bulk-status", label: "ค้นหาสถานะรายการ Bulk", icon: ListFilter },
      { key: "expenses", href: "/expenses", label: "รายจ่าย", icon: ReceiptText },
      { key: "bogo2pay", href: "/bogo2pay", label: "BoAntpay", icon: Landmark },
      { key: "safewallet", href: "/safewallet", label: "SafeWallet", icon: ShieldCheck }
    ]
  },
  {
    label: "รายงานและสถิติ",
    items: [
      { key: "summary", href: "/summary", label: "สรุปรายเดือน", icon: PieChart },
      { key: "audit", href: "/audit", label: "Audit", icon: ClipboardCheck }
    ]
  },
  {
    label: "การตั้งค่า",
    items: [
      { key: "settingsAccounts", href: "/settings/accounts", label: "บัญชีและ User", icon: KeyRound },
      { key: "settingsSystem", href: "/settings/system", label: "ตั้งค่าระบบ", icon: Settings }
    ]
  }
] as const;

export function AdminShell({ active, title, description, children, actions }: AdminShellProps) {
  let PageIcon = LayoutDashboard;
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.key === active) PageIcon = item.icon;
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <label className="menu-toggle-button" htmlFor="nav-toggle" aria-label="เปิดเมนู">
            <Menu size={20} strokeWidth={2.4} />
          </label>
          <span className="brand-mark" aria-hidden="true">
            <Zap size={20} strokeWidth={2.4} fill="currentColor" />
          </span>
          <div className="topbar-text">
            <span className="topbar-name">Antpay</span>
            <span className="topbar-sub">DASHBOARD</span>
          </div>
        </div>
        <div className="topbar-right">
          <div className="user-pill">
            <span className="user-avatar" aria-hidden="true">
              <User size={14} strokeWidth={2.2} />
            </span>
            <span>admin</span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="logout-button" type="submit" aria-label="ออกจากระบบ">
              <LogOut size={16} strokeWidth={2.2} />
              <span>ออก</span>
            </button>
          </form>
        </div>
      </header>
      <input id="nav-toggle" className="nav-toggle" type="checkbox" aria-hidden="true" />
      <label className="nav-scrim" htmlFor="nav-toggle" aria-hidden="true" />
      <aside className="nav" aria-label="ไซด์บาร์เมนูหลัก">
        <nav>
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.key;
                return (
                  <Link
                    key={`${group.label}-${item.key}`}
                    href={item.href as Route}
                    aria-current={isActive ? "page" : undefined}
                    className={`nav-link${isActive ? " is-active" : ""}`}
                  >
                    <Icon size={17} strokeWidth={2} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="nav-footer">
          <div className="nav-version">
            <WalletCards size={13} strokeWidth={2} />
            <span>Antpay BO · v1.0</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="page-header">
          <div className="page-heading">
            <span className="page-title-icon" aria-hidden="true">
              <PageIcon size={22} strokeWidth={2.2} />
            </span>
            <div>
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  tone = "default",
  icon,
  hint
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: ReactNode;
  hint?: string;
}) {
  return (
    <div className={`card metric-card tone-${tone}`}>
      <div className="metric-top">
        <p className="metric">{label}</p>
        {icon ? <span className="metric-icon">{icon}</span> : null}
      </div>
      <p className="value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </div>
  );
}
