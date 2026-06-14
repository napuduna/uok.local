"use client";

import {
  Archive,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { useState } from "react";

import {
  hasPermission,
  Permission,
  Role,
  type AuthenticatedUserResponse,
  type PermissionValue
} from "@warehouse/contracts";
import { MetricCard, StatusDot } from "@warehouse/ui";

const navigation = [
  {
    label: "ภาพรวม",
    icon: LayoutDashboard,
    active: true,
    group: "main",
    permissions: [Permission.DASHBOARD_VIEW]
  },
  {
    label: "สินค้า",
    icon: Boxes,
    group: "main",
    permissions: [Permission.PRODUCT_READ]
  },
  {
    label: "รับสินค้าเข้า",
    icon: PackagePlus,
    group: "main",
    permissions: [Permission.STOCK_MANAGE]
  },
  {
    label: "ปรับสต๊อก",
    icon: SlidersHorizontal,
    group: "main",
    permissions: [Permission.STOCK_MANAGE]
  },
  {
    label: "การขาย",
    icon: ShoppingCart,
    group: "main",
    permissions: [
      Permission.SALE_READ_ALL,
      Permission.SALE_READ_OWN,
      Permission.SALE_CREATE
    ]
  },
  {
    label: "ลูกค้า",
    icon: Users,
    group: "main",
    permissions: [Permission.CUSTOMER_READ]
  },
  {
    label: "รายงาน",
    icon: BarChart3,
    group: "main",
    permissions: [
      Permission.REPORT_SALES_ALL,
      Permission.REPORT_SALES_OWN,
      Permission.REPORT_STOCK
    ]
  },
  {
    label: "ตั้งค่า",
    icon: Settings,
    group: "system",
    permissions: [Permission.USER_MANAGE]
  }
] as const;

const roleLabels: Record<AuthenticatedUserResponse["role"], string> = {
  [Role.ADMIN]: "ผู้ดูแลระบบ",
  [Role.MANAGER]: "ผู้จัดการ",
  [Role.SALES]: "ฝ่ายขาย",
  [Role.WAREHOUSE]: "คลังสินค้า"
};

const defaultUser: AuthenticatedUserResponse = {
  id: "346a5fe3-4b31-4c89-ac39-37a2d13cf14d",
  email: "admin@uok.local",
  name: "ผู้ดูแลระบบ",
  role: Role.ADMIN
};

function canAccessAny(
  role: AuthenticatedUserResponse["role"],
  permissions: readonly PermissionValue[]
) {
  return permissions.some((permission) => hasPermission(role, permission));
}

const chartBars = [42, 56, 48, 72, 66, 81, 74, 88, 79, 94, 86, 96];

const lowStockItems = [
  { name: "ครีมสมุนไพร", code: "P002", stock: 12, level: "danger" as const },
  { name: "สบู่สมุนไพร", code: "P001", stock: 25, level: "warning" as const },
  { name: "เซรั่มมะขาม", code: "P018", stock: 38, level: "warning" as const }
];

const topProducts = [
  {
    code: "P001",
    name: "สบู่สมุนไพร",
    sold: "2,300",
    stock: "2,700",
    revenue: "฿184,000",
    status: "ปกติ",
    tone: "ok" as const
  },
  {
    code: "P007",
    name: "แชมพูอัญชัน",
    sold: "1,840",
    stock: "860",
    revenue: "฿147,200",
    status: "ปกติ",
    tone: "ok" as const
  },
  {
    code: "P002",
    name: "ครีมสมุนไพร",
    sold: "1,520",
    stock: "12",
    revenue: "฿136,800",
    status: "ใกล้หมด",
    tone: "danger" as const
  },
  {
    code: "P014",
    name: "ยาหม่องไพล",
    sold: "1,270",
    stock: "420",
    revenue: "฿88,900",
    status: "ปกติ",
    tone: "ok" as const
  }
];

interface DashboardShellProps {
  currentUser?: AuthenticatedUserResponse;
  todayLabel?: string;
}

export function DashboardShell({
  currentUser = defaultUser,
  todayLabel = "วันอาทิตย์ที่ 14 มิถุนายน 2569"
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const visibleNavigation = navigation.filter((item) =>
    canAccessAny(currentUser.role, item.permissions)
  );

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? "sidebar sidebar--open" : "sidebar"}>
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden="true">
            <Archive size={20} strokeWidth={2.2} />
          </div>
          <div>
            <strong>ยู.โอเค คลังสินค้า</strong>
            <span>Warehouse system</span>
          </div>
          <button
            className="icon-button sidebar__close"
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="เมนูหลัก">
          <p className="sidebar__section-label">เมนูหลัก</p>
          {visibleNavigation
            .filter((item) => item.group === "main")
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={
                    "active" in item && item.active
                      ? "nav-item nav-item--active"
                      : "nav-item"
                  }
                  type="button"
                  key={item.label}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          <p className="sidebar__section-label sidebar__section-label--settings">
            ระบบ
          </p>
          {visibleNavigation
            .filter((item) => item.group === "system")
            .map((item) => {
              const Icon = item.icon;
              return (
                <button className="nav-item" type="button" key={item.label}>
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="sidebar__footer">
          <div className="warehouse-status">
            <span className="warehouse-status__dot" />
            <div>
              <strong>คลังหลัก</strong>
              <span>ระบบพร้อมใช้งาน</span>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="ปิดเมนู"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="เปิดเมนู"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar__title">
            <h1>ภาพรวมคลังสินค้า</h1>
            <p>{todayLabel}</p>
          </div>

          <div className="topbar__actions">
            <label className="search-control">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">ค้นหา</span>
              <input type="search" placeholder="ค้นหาสินค้า หรือลูกค้า" />
            </label>
            <button
              className="icon-button notification-button"
              type="button"
              aria-label="การแจ้งเตือน"
            >
              <Bell size={19} />
              <span className="notification-button__dot" />
            </button>
            <button className="profile-button" type="button">
              <span className="profile-button__avatar">
                <CircleUserRound size={22} />
              </span>
              <span className="profile-button__copy">
                <strong>{currentUser.name}</strong>
                <small>{roleLabels[currentUser.role]}</small>
              </span>
              <ChevronDown size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
              onClick={() => void logout()}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <main className="dashboard">
          <section className="dashboard__heading">
            <div>
              <h2>สถานะธุรกิจวันนี้</h2>
              <p>ข้อมูลล่าสุดจากคลังหลักและรายการขายทั้งหมด</p>
            </div>
            <button className="secondary-button" type="button">
              <ClipboardList size={17} />
              ดูรายงาน
            </button>
          </section>

          <section className="metrics-grid" aria-label="สรุปข้อมูล">
            <MetricCard
              icon={<Boxes size={20} />}
              label="สินค้าทั้งหมด"
              value="250 รายการ"
              detail="+12 รายการเดือนนี้"
            />
            <MetricCard
              icon={<Archive size={20} />}
              label="สินค้าคงเหลือ"
              value="15,250 ชิ้น"
              detail="มูลค่า ฿486,700"
            />
            <MetricCard
              icon={<TrendingUp size={20} />}
              label="ยอดขายวันนี้"
              value="฿12,500"
              detail="+8.4% จากเมื่อวาน"
              tone="positive"
            />
            {hasPermission(currentUser.role, Permission.COSTING_READ) ? (
              <MetricCard
                icon={<BarChart3 size={20} />}
                label="กำไรขั้นต้นเดือนนี้"
                value="฿98,400"
                detail="อัตรากำไร 27.6%"
                tone="positive"
              />
            ) : null}
          </section>

          <section className="dashboard-grid">
            <article className="panel sales-panel">
              <div className="panel__header">
                <div>
                  <h3>ยอดขายรายวัน</h3>
                  <p>ยอดขายรวม 12 วันล่าสุด</p>
                </div>
                <button className="period-button" type="button">
                  12 วันล่าสุด
                  <ChevronDown size={15} />
                </button>
              </div>
              <div className="chart-summary">
                <strong>฿128,650</strong>
                <span>
                  <TrendingUp size={14} />
                  12.8%
                </span>
              </div>
              <div className="bar-chart" aria-label="กราฟยอดขายรายวัน">
                {chartBars.map((height, index) => (
                  <div className="bar-chart__item" key={`${height}-${index}`}>
                    <div
                      className={
                        index === chartBars.length - 1
                          ? "bar-chart__bar bar-chart__bar--active"
                          : "bar-chart__bar"
                      }
                      style={{ height: `${height}%` }}
                    />
                    <span>{index % 2 === 0 ? index + 1 : ""}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel alert-panel">
              <div className="panel__header">
                <div>
                  <h3>สินค้าใกล้หมด</h3>
                  <p>ต่ำกว่าจุดสั่งซื้อที่กำหนด</p>
                </div>
                <span className="alert-count">8</span>
              </div>
              <div className="alert-list">
                {lowStockItems.map((item) => (
                  <div className="alert-row" key={item.code}>
                    <div
                      className={`product-avatar product-avatar--${item.level}`}
                    >
                      <TrendingDown size={17} />
                    </div>
                    <div className="alert-row__copy">
                      <strong>{item.name}</strong>
                      <span>{item.code}</span>
                    </div>
                    <div className="alert-row__stock">
                      <strong>{item.stock}</strong>
                      <span>ชิ้น</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="panel-link" type="button">
                ดูสินค้าทั้งหมด
              </button>
            </article>
          </section>

          <section className="panel products-panel">
            <div className="panel__header panel__header--table">
              <div>
                <h3>สินค้าขายดี</h3>
                <p>เรียงตามจำนวนขายในเดือนปัจจุบัน</p>
              </div>
              <button
                className="secondary-button secondary-button--compact"
                type="button"
              >
                ดูรายการสินค้า
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>สินค้า</th>
                    <th className="table-number">ขายแล้ว</th>
                    <th className="table-number">คงเหลือ</th>
                    <th className="table-number">ยอดขาย</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product) => (
                    <tr key={product.code}>
                      <td className="product-code">{product.code}</td>
                      <td>
                        <strong>{product.name}</strong>
                      </td>
                      <td className="table-number">{product.sold}</td>
                      <td className="table-number">{product.stock}</td>
                      <td className="table-number table-money">
                        {product.revenue}
                      </td>
                      <td>
                        <StatusDot label={product.status} tone={product.tone} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
