import { Zap } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-copy">
          <span className="login-logo" aria-hidden="true">
            <Zap size={28} fill="currentColor" />
          </span>
          <p className="login-kicker">Go2Pay BO</p>
          <h2>หลังบ้านสำหรับตรวจยอด โยกเงิน และ Audit</h2>
          <p>เข้าระบบก่อนใช้งาน Dashboard, Statement, สรุปรายเดือน และเครื่องมือเชื่อมต่อทั้งหมด</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
