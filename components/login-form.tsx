"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";

export function LoginForm() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setMessage(payload.message || "เข้าสู่ระบบไม่สำเร็จ");
      return;
    }
    window.location.href = "/";
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand">
        <span className="login-mark" aria-hidden="true">
          <LockKeyhole size={24} strokeWidth={2.3} />
        </span>
        <div>
          <p>Go2Pay Dashboard</p>
          <h1>เข้าสู่ระบบ</h1>
        </div>
      </div>
      <label className="login-field">
        <span>Username</span>
        <div>
          <UserRound size={18} />
          <input name="username" autoComplete="username" placeholder="admin" required />
        </div>
      </label>
      <label className="login-field">
        <span>Password</span>
        <div>
          <LockKeyhole size={18} />
          <input name="password" type="password" autoComplete="current-password" placeholder="รหัสผ่าน" required />
        </div>
      </label>
      {message ? <p className="login-error">{message}</p> : null}
      <button className="login-button" type="submit" disabled={loading}>
        <LogIn size={18} />
        <span>{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</span>
      </button>
    </form>
  );
}

