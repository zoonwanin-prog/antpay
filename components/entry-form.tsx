"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Save, TriangleAlert } from "lucide-react";

type EntryKind = "transfers" | "crypto_transactions" | "expenses" | "balances" | "bogo2pay_transactions";
type MasterOption = { id?: string; name?: string; username?: string; account_no?: string; address?: string };

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const entryLabels: Record<EntryKind, string> = {
  transfers: "โยกเงิน",
  crypto_transactions: "คริปโต",
  expenses: "รายจ่าย",
  balances: "ยอดคงเหลือ",
  bogo2pay_transactions: "BoGo2pay"
};

const statusOptions: Record<EntryKind, string[]> = {
  transfers: ["โยกเงิน", "โอน Settlement", "โอนตามยอดerror", "เติมทุน", "คืนทุน", "อื่นๆ", "ฝากเงินสด", "ถอนเงินสด"],
  crypto_transactions: ["ซื้อ USDT", "ถอน USDT", "โอน USDT", "ขาย USDT"],
  expenses: [],
  balances: ["บัญชีฝาก", "บัญชีถอน", "ระบบ", "ธนาคาร"],
  bogo2pay_transactions: ["ฝาก", "ถอน"]
};

function optionLabel(option: MasterOption) {
  const name = option.name || option.username || "";
  const suffix = option.account_no || option.address || "";
  return suffix ? `${name} · ${suffix}` : name;
}

function accountValue(option: MasterOption) {
  return option.name || option.username || "";
}

function AccountSelect({
  name,
  placeholder,
  options
}: {
  name: string;
  placeholder: string;
  options: MasterOption[];
}) {
  if (!options.length) return <input name={name} placeholder={placeholder} />;
  return (
    <select name={name} defaultValue="">
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id || accountValue(option)} value={accountValue(option)}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  );
}

export function EntryForm({
  initialKind = "transfers",
  lockedKind = false,
  bankAccounts = [],
  cryptoAccounts = [],
  users = []
}: {
  initialKind?: EntryKind;
  lockedKind?: boolean;
  bankAccounts?: MasterOption[];
  cryptoAccounts?: MasterOption[];
  users?: MasterOption[];
}) {
  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"" | "ok" | "err">("");
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");

  const amountNumber = Number(amount || 0);
  const feeNumber = Number(fee || 0);
  const exchangeRateNumber = Number(exchangeRate || 0);
  const computedUsdt = kind === "crypto_transactions" && exchangeRateNumber > 0 ? amountNumber / exchangeRateNumber : 0;
  const computedNet = kind === "bogo2pay_transactions" ? amountNumber - feeNumber : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);
    setSaving(true);
    setMessage("");
    setStatus("");
    const common = {
      table: kind,
      date: formData.get("date"),
      time: formData.get("time") || null,
      note: formData.get("note") || null,
      user_name: formData.get("user_name") || "admin"
    };
    const postedAmount = Number(formData.get("amount") || 0);
    const postedFee = Number(formData.get("fee") || 0);
    const payload =
      kind === "transfers" ? {
        ...common,
        source_account: formData.get("source_account"),
        status: formData.get("status"),
        target_account: formData.get("target_account"),
        amount: postedAmount,
        fee: postedFee,
        slip_url: null
      } : kind === "crypto_transactions" ? {
        ...common,
        source_account: formData.get("source_account"),
        status: formData.get("status"),
        target_account: formData.get("target_account"),
        amount_thb: postedAmount,
        exchange_rate: Number(formData.get("exchange_rate") || 0),
        usdt: Number(formData.get("usdt") || 0) || computedUsdt,
        slip_url: null
      } : kind === "expenses" ? {
        ...common,
        item: formData.get("item") || "รายจ่าย",
        amount: postedAmount
      } : kind === "balances" ? {
        ...common,
        account_name: formData.get("source_account") || "ไม่ระบุ",
        balance_type: formData.get("status") || "บัญชีฝาก",
        amount: postedAmount
      } : {
        ...common,
        item: formData.get("item") || "BoGo2pay",
        type: formData.get("status") || "ฝาก",
        actual_amount: postedAmount,
        fee: postedFee,
        net_amount: postedAmount - postedFee
      };

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setStatus("ok");
        setMessage("บันทึกรายการสำเร็จ");
        formEl.reset();
        setAmount("");
        setFee("");
        setExchangeRate("");
      } else {
        setStatus("err");
        setMessage(json.message || "บันทึกไม่สำเร็จ");
      }
    } catch (error) {
      setStatus("err");
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel form-box">
      <div className="panel-header">
        <div>
          <h2>บันทึก{entryLabels[kind]}</h2>
          <p>กรอกรายละเอียดให้ครบถ้วน แล้วกดบันทึก</p>
        </div>
      </div>
      <div className="form-body">
        <form onSubmit={submit} className="form-grid igrid">
          {!lockedKind ? (
            <label>
              <span>ประเภทฟอร์ม</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as EntryKind)}>
                <option value="transfers">โยกเงิน</option>
                <option value="crypto_transactions">คริปโต</option>
                <option value="balances">ยอดคงเหลือ</option>
                <option value="expenses">รายจ่าย</option>
                <option value="bogo2pay_transactions">BoGo2pay</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>วันที่</span>
            <input type="date" name="date" defaultValue={today} required />
          </label>
          <label>
            <span>เวลา</span>
            <input type="time" name="time" />
          </label>
          {kind !== "expenses" && kind !== "bogo2pay_transactions" ? (
            <label>
              <span>{kind === "balances" ? "จากบัญชี" : "บัญชีต้นทาง"}</span>
              <AccountSelect name="source_account" placeholder="เลือกบัญชีต้นทาง" options={bankAccounts} />
            </label>
          ) : null}
          {kind === "transfers" || kind === "crypto_transactions" ? (
            <label>
              <span>บัญชีปลายทาง</span>
              <AccountSelect
                name="target_account"
                placeholder="เลือกบัญชีปลายทาง"
                options={kind === "crypto_transactions" ? cryptoAccounts : bankAccounts}
              />
            </label>
          ) : null}
          {kind === "expenses" || kind === "bogo2pay_transactions" ? (
            <label>
              <span>รายการ</span>
              <input name="item" placeholder={kind === "expenses" ? "ระบุรายการค่าใช้จ่าย" : "Go2Pay"} />
            </label>
          ) : null}
          {statusOptions[kind].length ? (
            <label>
              <span>{kind === "balances" ? "ประเภท" : "สถานะ"}</span>
              <select name="status" required>
                {statusOptions[kind].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>{kind === "crypto_transactions" || kind === "bogo2pay_transactions" ? "จำนวนเงิน (THB)" : "จำนวน"}</span>
            <input
              name="amount"
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          {kind === "transfers" || kind === "bogo2pay_transactions" ? (
            <label>
              <span>ค่าธรรมเนียม</span>
              <input
                name="fee"
                placeholder="0"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
            </label>
          ) : null}
          {kind === "crypto_transactions" ? (
            <label>
              <span>อัตราแลกเปลี่ยน</span>
              <input
                name="exchange_rate"
                placeholder="0.00"
                inputMode="decimal"
                value={exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
              />
            </label>
          ) : null}
          {kind === "crypto_transactions" ? (
            <label>
              <span>USDT</span>
              <input
                name="usdt"
                placeholder={computedUsdt ? computedUsdt.toFixed(6) : "0.00"}
                inputMode="decimal"
              />
            </label>
          ) : null}
          {kind === "bogo2pay_transactions" ? (
            <label>
              <span>ยอดสุทธิ</span>
              <input value={computedNet.toFixed(2)} readOnly />
            </label>
          ) : null}
          <label>
            <span>ผู้บันทึก</span>
            <AccountSelect name="user_name" placeholder="admin" options={users.map((user) => ({ ...user, name: user.username || user.name }))} />
          </label>
          <label className="wide-field">
            <span>หมายเหตุ</span>
            <input name="note" placeholder="หมายเหตุ (ถ้ามี)" />
          </label>
          <div className="form-actions wide-field">
            <button type="submit" disabled={saving} className="btn-primary-submit">
              <Save size={17} />
              <span>{saving ? "กำลังบันทึก..." : "บันทึกรายการ"}</span>
            </button>
          </div>
        </form>
        {message ? (
          <div className={`msg ${status === "ok" ? "msg-success" : "msg-error"}`} role="status">
            {status === "ok" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
            <span>{message}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
