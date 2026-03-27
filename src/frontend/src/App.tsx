import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Phase = "waiting" | "flying" | "crashed";

interface Player {
  id: number;
  name: string;
  bet: number;
  targetMultiplier: number;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
}

interface CrashRecord {
  multiplier: number;
  id: number;
}

interface Winner {
  name: string;
  bet: number;
  multiplier: number;
  win: number;
}

const PLAYER_NAMES = [
  "StarRider",
  "LuckyAce",
  "SpaceWolf",
  "CryptoKing",
  "NightOwl",
  "BlazeFox",
  "IronEagle",
  "ShadowBet",
  "GoldRush",
  "MoonShot",
  "NovaBet",
  "CosmicX",
];

const BET_PRESETS = ["10", "25", "50", "100"];
const DEPOSIT_PRESETS = [10, 25, 50, 100, 200];
const WITHDRAW_PRESETS = [10, 25, 50, 100];

const INITIAL_CRASHES: CrashRecord[] = [
  { multiplier: 1.24, id: 1 },
  { multiplier: 3.5, id: 2 },
  { multiplier: 8.2, id: 3 },
  { multiplier: 1.06, id: 4 },
  { multiplier: 15.3, id: 5 },
  { multiplier: 2.44, id: 6 },
  { multiplier: 4.7, id: 7 },
  { multiplier: 1.9, id: 8 },
  { multiplier: 22.1, id: 9 },
  { multiplier: 1.33, id: 10 },
];

const INITIAL_WINNERS: Winner[] = [
  { name: "CryptoKing", bet: 200, multiplier: 15.3, win: 3060 },
  { name: "MoonShot", bet: 100, multiplier: 8.2, win: 820 },
  { name: "GoldRush", bet: 50, multiplier: 22.1, win: 1105 },
  { name: "SpaceWolf", bet: 100, multiplier: 4.7, win: 470 },
  { name: "LuckyAce", bet: 25, multiplier: 8.2, win: 205 },
  { name: "IronEagle", bet: 50, multiplier: 3.5, win: 175 },
  { name: "NovaBet", bet: 25, multiplier: 5.2, win: 130 },
  { name: "CosmicX", bet: 100, multiplier: 2.1, win: 210 },
];

let roundIdCounter = 100;

function generatePlayers(): Player[] {
  const count = 8 + Math.floor(Math.random() * 3);
  const shuffled = [...PLAYER_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: shuffled[i % shuffled.length],
    bet: [5, 10, 25, 50, 100, 200][Math.floor(Math.random() * 6)],
    targetMultiplier: 1.3 + Math.random() * 8,
    cashedOut: false,
    cashoutMultiplier: null,
  }));
}

function newCrashPoint(): number {
  return Math.min(50, Math.max(1.1, 0.97 / (1 - Math.random())));
}

function formatMult(m: number): string {
  return `${m.toFixed(2)}x`;
}

function multColor(m: number): string {
  if (m < 2) return "text-[#FF6B6B]";
  if (m < 5) return "text-[#F5C542]";
  return "text-[#2AD16B]";
}

function crashBadgeColor(m: number): string {
  if (m < 2) return "bg-[#FF4B4B]/20 text-[#FF6B6B] border-[#FF4B4B]/40";
  if (m < 5) return "bg-[#F5C542]/20 text-[#F5C542] border-[#F5C542]/40";
  return "bg-[#2AD16B]/20 text-[#2AD16B] border-[#2AD16B]/40";
}

function getRocketPos(mult: number): { x: number; y: number } {
  const t = Math.min(0.93, Math.log(Math.max(mult, 1.001)) / Math.log(50));
  return {
    x: 5 + 88 * t,
    y: 93 - 86 * t ** 0.65,
  };
}

function getPathPoints(maxMult: number): string {
  if (maxMult <= 1.001) return "5,93";
  const steps = Math.min(80, Math.ceil((maxMult - 1) / 0.05));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const m = 1 + (maxMult - 1) * (i / steps);
    const { x, y } = getRocketPos(m);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// ── Cashier Dialog ──────────────────────────────────────────────────────────
const INR_RATE = 83.5; // 1 USD = 83.50 INR

interface CashierDialogProps {
  balance: number;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  defaultTab?: "deposit" | "withdraw";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CashierDialog({
  balance,
  onDeposit,
  onWithdraw,
  defaultTab = "deposit",
  open,
  onOpenChange,
}: CashierDialogProps) {
  const [cashierTab, setCashierTab] = useState<"deposit" | "withdraw">(
    defaultTab,
  );
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"card" | "bank">("card");
  const [withdrawMethod, setWithdrawMethod] = useState<"card" | "bank">("card");

  // Bank transfer state
  const [inrDepositAmt, setInrDepositAmt] = useState<number | null>(null);
  const [utrRef, setUtrRef] = useState("");
  const [inrWithdrawAmt, setInrWithdrawAmt] = useState<number | null>(null);
  const [bankHolder, setBankHolder] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankUpi, setBankUpi] = useState("");

  useEffect(() => {
    if (open) setCashierTab(defaultTab);
  }, [defaultTab, open]);

  const handleDeposit = () => {
    const amount = Number.parseFloat(depositAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid deposit amount");
      return;
    }
    onDeposit(amount);
    toast.success(`Deposited $${amount.toFixed(2)} to your balance`);
    setDepositAmount("");
    onOpenChange(false);
  };

  const handleWithdraw = () => {
    const amount = Number.parseFloat(withdrawAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid withdrawal amount");
      return;
    }
    if (amount > balance) {
      toast.error("Insufficient balance for this withdrawal");
      return;
    }
    onWithdraw(amount);
    toast.success(`$${amount.toFixed(2)} withdrawn successfully`);
    setWithdrawAmount("");
    onOpenChange(false);
  };

  const handleBankDeposit = () => {
    if (!inrDepositAmt || inrDepositAmt <= 0) {
      toast.error("Select or enter an INR amount");
      return;
    }
    if (!utrRef.trim()) {
      toast.error("Enter your UTR / Transaction Reference");
      return;
    }
    const usd = inrDepositAmt / INR_RATE;
    onDeposit(usd);
    toast.success(
      `₹${inrDepositAmt.toLocaleString("en-IN")} deposited (≈ $${usd.toFixed(2)})`,
    );
    setInrDepositAmt(null);
    setUtrRef("");
    onOpenChange(false);
  };

  const handleBankWithdraw = () => {
    if (!inrWithdrawAmt || inrWithdrawAmt <= 0) {
      toast.error("Select or enter an INR amount");
      return;
    }
    if (!bankHolder.trim() || !bankAccount.trim() || !bankIfsc.trim()) {
      toast.error("Fill in all required bank details");
      return;
    }
    const usd = inrWithdrawAmt / INR_RATE;
    if (usd > balance) {
      toast.error("Insufficient balance for this withdrawal");
      return;
    }
    onWithdraw(usd);
    toast.success(
      `₹${inrWithdrawAmt.toLocaleString("en-IN")} withdrawal submitted — arrives in 1–2 hours`,
    );
    setInrWithdrawAmt(null);
    setBankHolder("");
    setBankAccount("");
    setBankIfsc("");
    setBankUpi("");
    onOpenChange(false);
  };

  const INR_DEPOSIT_PRESETS = [500, 1000, 2000, 5000, 10000];
  const INR_WITHDRAW_PRESETS = [500, 1000, 2000, 5000];

  const methodPills = (
    active: "card" | "bank",
    setActive: (v: "card" | "bank") => void,
  ) => (
    <div className="flex gap-2 mb-5">
      <button
        type="button"
        onClick={() => setActive("card")}
        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
          active === "card"
            ? "bg-[#F5C542] text-[#0B1220] border-[#F5C542]"
            : "bg-[#22304A] text-[#8B96AD] border-[#2E3E55] hover:border-[#F5C542]"
        }`}
        data-ocid="cashier.card.toggle"
      >
        💳 Card / Coins
      </button>
      <button
        type="button"
        onClick={() => setActive("bank")}
        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
          active === "bank"
            ? "bg-[#4ADE80] text-[#0B1220] border-[#4ADE80]"
            : "bg-[#22304A] text-[#8B96AD] border-[#2E3E55] hover:border-[#4ADE80]"
        }`}
        data-ocid="cashier.bank.toggle"
      >
        🏦 Bank Transfer (INR)
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-[#22304A] p-0 overflow-hidden"
        style={{ background: "#0F1929" }}
        data-ocid="cashier.dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-[#F2F5FF] text-lg font-extrabold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#F5C542]" />
            Cashier
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={cashierTab}
          onValueChange={(v) => setCashierTab(v as "deposit" | "withdraw")}
          className="w-full"
        >
          <TabsList
            className="w-full rounded-none bg-[#0D1624] border-b border-[#22304A] p-0 h-auto mx-0"
            data-ocid="cashier.tabs.tab"
          >
            <TabsTrigger
              value="deposit"
              className="flex-1 rounded-none py-3 text-sm font-semibold data-[state=active]:bg-transparent data-[state=active]:text-[#F5C542] data-[state=active]:border-b-2 data-[state=active]:border-[#F5C542] text-[#8B96AD] transition-colors"
              data-ocid="cashier.deposit.tab"
            >
              💳 Deposit
            </TabsTrigger>
            <TabsTrigger
              value="withdraw"
              className="flex-1 rounded-none py-3 text-sm font-semibold data-[state=active]:bg-transparent data-[state=active]:text-[#F5C542] data-[state=active]:border-b-2 data-[state=active]:border-[#F5C542] text-[#8B96AD] transition-colors"
              data-ocid="cashier.withdraw.tab"
            >
              🏦 Withdraw
            </TabsTrigger>
          </TabsList>

          {/* ── DEPOSIT TAB ── */}
          <TabsContent
            value="deposit"
            className="m-0 p-6 max-h-[70vh] overflow-y-auto"
          >
            {methodPills(depositMethod, setDepositMethod)}

            {depositMethod === "card" ? (
              <>
                <p className="text-xs text-[#8B96AD] font-semibold uppercase tracking-widest mb-4">
                  Deposit Funds — Instant
                </p>
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {DEPOSIT_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDepositAmount(String(v))}
                      className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                        depositAmount === String(v)
                          ? "bg-[#F5C542] text-[#0B1220] border-[#F5C542]"
                          : "bg-[#22304A] text-[#F2F5FF] border-[#2E3E55] hover:border-[#F5C542] hover:text-[#F5C542]"
                      }`}
                      data-ocid={`cashier.deposit.preset_${v}.button`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="deposit-amount"
                    className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                  >
                    Custom Amount
                  </label>
                  <input
                    id="deposit-amount"
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter amount..."
                    className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#F5C542] transition-colors"
                    data-ocid="cashier.deposit.input"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleDeposit}
                  className="w-full py-3 rounded-xl font-extrabold text-sm gold-gradient text-[#0B1220] hover:opacity-90 transition-opacity shadow-lg"
                  data-ocid="cashier.deposit.submit_button"
                >
                  ⚡ Deposit Instantly
                  {depositAmount &&
                  !Number.isNaN(Number.parseFloat(depositAmount)) &&
                  Number.parseFloat(depositAmount) > 0
                    ? ` — $${Number.parseFloat(depositAmount).toFixed(2)}`
                    : ""}
                </button>
              </>
            ) : (
              <>
                {/* Exchange rate banner */}
                <div className="flex items-center justify-between bg-[#0D1624] border border-[#22304A] rounded-xl px-4 py-3 mb-4">
                  <span className="text-xs text-[#8B96AD] font-medium">
                    Exchange Rate
                  </span>
                  <span className="text-sm font-extrabold text-[#4ADE80]">
                    1 USD = ₹{INR_RATE.toFixed(2)}
                  </span>
                </div>

                {/* INR preset amounts */}
                <p className="text-xs text-[#8B96AD] font-semibold uppercase tracking-widest mb-2">
                  Select Amount (INR)
                </p>
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {INR_DEPOSIT_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setInrDepositAmt(v)}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                        inrDepositAmt === v
                          ? "bg-[#4ADE80] text-[#0B1220] border-[#4ADE80]"
                          : "bg-[#22304A] text-[#4ADE80] border-[#2E3E55] hover:border-[#4ADE80]"
                      }`}
                      data-ocid={`cashier.deposit.inr_preset_${v}.button`}
                    >
                      ₹{v >= 1000 ? `${v / 1000}K` : v}
                    </button>
                  ))}
                </div>

                {/* Custom INR input */}
                <div className="mb-4">
                  <label
                    htmlFor="inr-deposit-custom"
                    className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                  >
                    Custom Amount (₹)
                  </label>
                  <input
                    id="inr-deposit-custom"
                    type="number"
                    value={inrDepositAmt ?? ""}
                    onChange={(e) =>
                      setInrDepositAmt(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder="Enter INR amount..."
                    className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#4ADE80] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors"
                    data-ocid="cashier.deposit.inr_input"
                  />
                  {inrDepositAmt && inrDepositAmt > 0 && (
                    <p className="text-xs text-[#8B96AD] mt-1">
                      ≈ ${(inrDepositAmt / INR_RATE).toFixed(2)} USD will be
                      credited
                    </p>
                  )}
                </div>

                {/* Bank details */}
                <div className="bg-[#0A1320] border border-[#22304A] rounded-xl p-4 mb-4">
                  <p className="text-xs text-[#F5C542] font-bold uppercase tracking-widest mb-3">
                    Pay To
                  </p>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#8B96AD]">UPI ID</span>
                      <span className="text-[#F2F5FF] font-bold">
                        aviator@ybl
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B96AD]">Account Name</span>
                      <span className="text-[#F2F5FF]">
                        Aviator Rocket Money
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B96AD]">IFSC</span>
                      <span className="text-[#F2F5FF]">HDFC0001234</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8B96AD]">Account No</span>
                      <span className="text-[#F2F5FF]">XXXX XXXX 4892</span>
                    </div>
                  </div>
                </div>

                {/* UTR reference */}
                <div className="mb-4">
                  <label
                    htmlFor="utr-ref"
                    className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                  >
                    UTR / Transaction Reference
                  </label>
                  <input
                    id="utr-ref"
                    type="text"
                    value={utrRef}
                    onChange={(e) => setUtrRef(e.target.value)}
                    placeholder="Enter UTR number..."
                    className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors font-mono"
                    data-ocid="cashier.deposit.utr_input"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleBankDeposit}
                  className="w-full py-3 rounded-xl font-extrabold text-sm bg-[#4ADE80] text-[#0B1220] hover:bg-[#22c55e] transition-colors shadow-lg"
                  data-ocid="cashier.deposit.bank_submit_button"
                >
                  ⚡ Confirm Bank Transfer
                  {inrDepositAmt && inrDepositAmt > 0
                    ? ` — ₹${inrDepositAmt.toLocaleString("en-IN")}`
                    : ""}
                </button>
              </>
            )}
          </TabsContent>

          {/* ── WITHDRAW TAB ── */}
          <TabsContent
            value="withdraw"
            className="m-0 p-6 max-h-[70vh] overflow-y-auto"
          >
            {methodPills(withdrawMethod, setWithdrawMethod)}

            {withdrawMethod === "card" ? (
              <>
                <p className="text-xs text-[#8B96AD] font-semibold uppercase tracking-widest mb-3">
                  Instant Withdrawal
                </p>
                <div className="bg-[#0D1624] border border-[#22304A] rounded-xl p-4 mb-4">
                  <div className="text-xs text-[#8B96AD] font-medium mb-1">
                    Available Balance
                  </div>
                  <div className="text-3xl font-extrabold text-[#F5C542] multiplier-font">
                    ${balance.toFixed(2)}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {WITHDRAW_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setWithdrawAmount(String(v))}
                      disabled={balance < v}
                      className={`py-2 rounded-lg text-sm font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        withdrawAmount === String(v)
                          ? "bg-[#F5C542] text-[#0B1220] border-[#F5C542]"
                          : "bg-[#22304A] text-[#F2F5FF] border-[#2E3E55] hover:border-[#F5C542] hover:text-[#F5C542]"
                      }`}
                      data-ocid={`cashier.withdraw.preset_${v}.button`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="withdraw-amount"
                    className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                  >
                    Custom Amount
                  </label>
                  <input
                    id="withdraw-amount"
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Enter amount..."
                    max={balance}
                    className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#F5C542] transition-colors"
                    data-ocid="cashier.withdraw.input"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  className="w-full py-3 rounded-xl font-extrabold text-sm bg-[#2AD16B] text-[#0B1220] hover:bg-[#22b85d] transition-colors shadow-lg"
                  data-ocid="cashier.withdraw.submit_button"
                >
                  🏦 Withdraw
                  {withdrawAmount &&
                  !Number.isNaN(Number.parseFloat(withdrawAmount)) &&
                  Number.parseFloat(withdrawAmount) > 0
                    ? ` $${Number.parseFloat(withdrawAmount).toFixed(2)}`
                    : ""}
                </button>
              </>
            ) : (
              <>
                {/* Balance display in USD + INR */}
                <div className="bg-[#0D1624] border border-[#22304A] rounded-xl p-4 mb-4">
                  <div className="text-xs text-[#8B96AD] font-medium mb-1">
                    Available Balance
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="text-2xl font-extrabold text-[#F5C542] multiplier-font">
                      ${balance.toFixed(2)}
                    </div>
                    <div className="text-lg font-bold text-[#4ADE80] mb-0.5">
                      ≈ ₹
                      {(balance * INR_RATE).toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </div>
                  <div className="text-xs text-[#8B96AD] mt-1">
                    1 USD = ₹{INR_RATE.toFixed(2)}
                  </div>
                </div>

                {/* INR preset amounts */}
                <p className="text-xs text-[#8B96AD] font-semibold uppercase tracking-widest mb-2">
                  Withdraw Amount (INR)
                </p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {INR_WITHDRAW_PRESETS.map((v) => {
                    const usd = v / INR_RATE;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setInrWithdrawAmt(v)}
                        disabled={usd > balance}
                        className={`py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          inrWithdrawAmt === v
                            ? "bg-[#4ADE80] text-[#0B1220] border-[#4ADE80]"
                            : "bg-[#22304A] text-[#4ADE80] border-[#2E3E55] hover:border-[#4ADE80]"
                        }`}
                        data-ocid={`cashier.withdraw.inr_preset_${v}.button`}
                      >
                        ₹{v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="inr-withdraw-custom"
                    className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                  >
                    Custom Amount (₹)
                  </label>
                  <input
                    id="inr-withdraw-custom"
                    type="number"
                    value={inrWithdrawAmt ?? ""}
                    onChange={(e) =>
                      setInrWithdrawAmt(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder="Enter INR amount..."
                    className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#4ADE80] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors"
                    data-ocid="cashier.withdraw.inr_input"
                  />
                  {inrWithdrawAmt && inrWithdrawAmt > 0 && (
                    <p className="text-xs text-[#8B96AD] mt-1">
                      ≈ ${(inrWithdrawAmt / INR_RATE).toFixed(2)} USD will be
                      deducted
                    </p>
                  )}
                </div>

                {/* Bank details form */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label
                      htmlFor="bank-holder"
                      className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                    >
                      Account Holder Name{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="bank-holder"
                      type="text"
                      value={bankHolder}
                      onChange={(e) => setBankHolder(e.target.value)}
                      placeholder="Full name as per bank..."
                      className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors"
                      data-ocid="cashier.withdraw.bank_holder_input"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="bank-account"
                      className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                    >
                      Account Number <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="bank-account"
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder="Enter account number..."
                      className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors font-mono"
                      data-ocid="cashier.withdraw.bank_account_input"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="bank-ifsc"
                      className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                    >
                      IFSC Code <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="bank-ifsc"
                      type="text"
                      value={bankIfsc}
                      onChange={(e) =>
                        setBankIfsc(e.target.value.toUpperCase())
                      }
                      placeholder="e.g. HDFC0001234"
                      className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors font-mono uppercase"
                      data-ocid="cashier.withdraw.bank_ifsc_input"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="bank-upi"
                      className="text-xs text-[#8B96AD] font-medium mb-1.5 block"
                    >
                      UPI ID <span className="text-[#8B96AD]">(optional)</span>
                    </label>
                    <input
                      id="bank-upi"
                      type="text"
                      value={bankUpi}
                      onChange={(e) => setBankUpi(e.target.value)}
                      placeholder="yourname@upi"
                      className="w-full bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-2.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#4ADE80] transition-colors font-mono"
                      data-ocid="cashier.withdraw.bank_upi_input"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBankWithdraw}
                  className="w-full py-3 rounded-xl font-extrabold text-sm bg-[#4ADE80] text-[#0B1220] hover:bg-[#22c55e] transition-colors shadow-lg"
                  data-ocid="cashier.withdraw.bank_submit_button"
                >
                  ⚡ Withdraw to Bank
                  {inrWithdrawAmt && inrWithdrawAmt > 0
                    ? ` — ₹${inrWithdrawAmt.toLocaleString("en-IN")}`
                    : ""}
                </button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [multiplier, setMultiplier] = useState(1.0);
  const [countdown, setCountdown] = useState(5);
  const [balance, setBalance] = useState(1000);
  const [betAmount, setBetAmount] = useState("10");
  const [currentBet, setCurrentBet] = useState<number | null>(null);
  const [autoCashout, setAutoCashout] = useState("");
  const [cashoutMultiplier, setCashoutMultiplier] = useState<number | null>(
    null,
  );
  const [players, setPlayers] = useState<Player[]>(() => generatePlayers());
  const [recentCrashes, setRecentCrashes] =
    useState<CrashRecord[]>(INITIAL_CRASHES);
  const [showExplosion, setShowExplosion] = useState(false);
  const [activeTab, setActiveTab] = useState("live");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Cashier dialog state
  const [cashierOpen, setCashierOpen] = useState(false);
  const [cashierDefaultTab, setCashierDefaultTab] = useState<
    "deposit" | "withdraw"
  >("deposit");

  const openCashier = (tab: "deposit" | "withdraw") => {
    setCashierDefaultTab(tab);
    setCashierOpen(true);
  };

  // Refs for interval closures
  const crashPointRef = useRef(2.0);
  const currentBetRef = useRef<number | null>(null);
  const cashoutMultiplierRef = useRef<number | null>(null);
  const autoCashoutRef = useRef("");
  const balanceRef = useRef(1000);

  // Keep refs in sync
  useEffect(() => {
    autoCashoutRef.current = autoCashout;
  }, [autoCashout]);
  useEffect(() => {
    currentBetRef.current = currentBet;
  }, [currentBet]);
  useEffect(() => {
    cashoutMultiplierRef.current = cashoutMultiplier;
  }, [cashoutMultiplier]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const startNewRound = useCallback(() => {
    const cp = newCrashPoint();
    crashPointRef.current = cp;
    setMultiplier(1.0);
    setCashoutMultiplier(null);
    cashoutMultiplierRef.current = null;
    setCurrentBet(null);
    currentBetRef.current = null;
    setPlayers(generatePlayers());
    setCountdown(5);
    setPhase("waiting");
    setShowExplosion(false);
  }, []);

  // Waiting countdown
  useEffect(() => {
    if (phase !== "waiting") return;
    let c = 5;
    setCountdown(5);
    const timer = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(timer);
        setPhase("flying");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Flying tick
  useEffect(() => {
    if (phase !== "flying") return;
    let currentMult = 1.0;

    const tick = setInterval(() => {
      currentMult *= 1.008;

      if (currentMult >= crashPointRef.current) {
        clearInterval(tick);
        const finalMult = Number.parseFloat(crashPointRef.current.toFixed(2));
        setMultiplier(finalMult);
        setPhase("crashed");
        setShowExplosion(true);

        setPlayers((prev) =>
          prev.map((p) =>
            p.cashedOut ? p : { ...p, cashoutMultiplier: null },
          ),
        );

        roundIdCounter++;
        const rid = roundIdCounter;
        setRecentCrashes((prev) => [
          { multiplier: finalMult, id: rid },
          ...prev.slice(0, 19),
        ]);

        if (
          currentBetRef.current !== null &&
          cashoutMultiplierRef.current === null
        ) {
          toast.error(
            `Crashed at ${finalMult}x — You lost $${currentBetRef.current.toFixed(2)}!`,
          );
        }

        setTimeout(() => startNewRound(), 3000);
        return;
      }

      const rounded = Number.parseFloat(currentMult.toFixed(2));
      setMultiplier(rounded);

      setPlayers((prev) =>
        prev.map((p) => {
          if (!p.cashedOut && currentMult >= p.targetMultiplier) {
            return {
              ...p,
              cashedOut: true,
              cashoutMultiplier: Number.parseFloat(currentMult.toFixed(2)),
            };
          }
          return p;
        }),
      );

      const acStr = autoCashoutRef.current;
      if (acStr && Number.parseFloat(acStr) >= 1.01) {
        const target = Number.parseFloat(acStr);
        if (
          currentMult >= target &&
          currentBetRef.current !== null &&
          cashoutMultiplierRef.current === null
        ) {
          const winnings = currentBetRef.current * target;
          cashoutMultiplierRef.current = target;
          setCashoutMultiplier(target);
          setBalance((prev) => prev + winnings);
          toast.success(
            `Auto cashed out at ${target.toFixed(2)}x! Won $${winnings.toFixed(2)}`,
          );
        }
      }
    }, 100);

    return () => clearInterval(tick);
  }, [phase, startNewRound]);

  const handlePlaceBet = () => {
    if (phase !== "waiting") return;
    const amount = Number.parseFloat(betAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid bet amount");
      return;
    }
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }
    if (currentBet !== null) {
      toast.error("Bet already placed for this round");
      return;
    }
    setBalance((prev) => prev - amount);
    setCurrentBet(amount);
    currentBetRef.current = amount;
    toast.success(`Bet placed: $${amount.toFixed(2)}`);
  };

  const handleCashOut = () => {
    if (phase !== "flying" || currentBet === null || cashoutMultiplier !== null)
      return;
    const winnings = currentBet * multiplier;
    setCashoutMultiplier(multiplier);
    cashoutMultiplierRef.current = multiplier;
    setBalance((prev) => prev + winnings);
    toast.success(
      `Cashed out at ${multiplier.toFixed(2)}x! Won $${winnings.toFixed(2)}`,
    );
  };

  const rocketPos = getRocketPos(multiplier);
  const pathPoints = getPathPoints(multiplier);
  const isHigh = multiplier > 5;

  const multiplierDisplayColor =
    phase === "crashed"
      ? "text-[#FF4B4B]"
      : phase === "flying"
        ? multiplier < 2
          ? "text-[#F2F5FF]"
          : multiplier < 5
            ? "text-[#F5C542]"
            : "text-[#2AD16B]"
        : "text-[#8B96AD]";

  const canBet = phase === "waiting" && currentBet === null;
  const canCashOut =
    phase === "flying" && currentBet !== null && cashoutMultiplier === null;

  const trailColor =
    phase === "crashed" ? "#FF4B4B" : isHigh ? "#2AD16B" : "#F5C542";

  return (
    <div className="min-h-screen bg-[#0B1220] text-[#F2F5FF] flex flex-col">
      <Toaster theme="dark" richColors />

      {/* Cashier Dialog */}
      <CashierDialog
        balance={balance}
        onDeposit={(amount) => setBalance((prev) => prev + amount)}
        onWithdraw={(amount) => setBalance((prev) => prev - amount)}
        defaultTab={cashierDefaultTab}
        open={cashierOpen}
        onOpenChange={setCashierOpen}
      />

      {/* Header */}
      <header className="border-b border-[#22304A] bg-[#0B1220]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-xl font-extrabold tracking-tight text-[#F5C542]">
              🚀 AVIOROCKET
            </span>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#8B96AD]">
              {["Home", "Games", "Tournaments", "Promo"].map((link) => (
                <button
                  key={link}
                  type="button"
                  className={`hover:text-[#F2F5FF] transition-colors ${
                    link === "Home" ? "text-[#F2F5FF]" : ""
                  }`}
                  data-ocid={`nav.${link.toLowerCase()}.link`}
                >
                  {link}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <span className="text-sm text-[#8B96AD]">
                  Balance:{" "}
                  <span className="text-[#F5C542] font-bold">
                    ${balance.toFixed(2)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openCashier("deposit")}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#F5C542]/10 border border-[#F5C542]/40 text-[#F5C542] hover:bg-[#F5C542]/20 transition-colors flex items-center gap-1.5"
                  data-ocid="header.cashier.open_modal_button"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Cashier
                </button>
                <button
                  type="button"
                  onClick={() => setIsLoggedIn(false)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-[#22304A] text-[#8B96AD] hover:text-[#F2F5FF] transition-colors"
                  data-ocid="header.logout.button"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsLoggedIn(true)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-[#22304A] text-[#8B96AD] hover:text-[#F2F5FF] transition-colors"
                  data-ocid="header.login.button"
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setIsLoggedIn(true)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold gold-gradient text-[#0B1220] hover:opacity-90 transition-opacity"
                  data-ocid="header.signup.button"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* LEFT: Game Visualization */}
          <div className="bg-[#121B2B] border border-[#22304A] rounded-xl overflow-hidden flex flex-col">
            {/* Round info bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#22304A]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8B96AD] font-medium">
                  ROUND
                </span>
                <Badge className="bg-[#22304A] text-[#8B96AD] border-[#22304A] text-xs">
                  #{roundIdCounter}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 overflow-hidden">
                {recentCrashes.slice(0, 6).map((c) => (
                  <span
                    key={c.id}
                    className={`text-xs px-2 py-0.5 rounded border font-mono font-semibold whitespace-nowrap ${crashBadgeColor(c.multiplier)}`}
                  >
                    {formatMult(c.multiplier)}
                  </span>
                ))}
              </div>
            </div>

            {/* Game canvas */}
            <div
              className={`relative game-grid overflow-hidden bg-[#0D1624] ${
                phase === "crashed" ? "animate-crash-flash" : ""
              }`}
              style={{ height: 320 }}
              data-ocid="game.canvas_target"
            >
              {/* SVG trail */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
                style={{ pointerEvents: "none" }}
              >
                <title>Game trail</title>
                {phase !== "waiting" && (
                  <polyline
                    points={pathPoints}
                    fill="none"
                    stroke={trailColor}
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.85"
                  />
                )}
              </svg>

              {/* Rocket / explosion */}
              <div
                className="absolute"
                style={{
                  left: `${rocketPos.x}%`,
                  top: `${rocketPos.y}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: 28,
                  lineHeight: 1,
                  transition:
                    phase === "flying"
                      ? "left 0.1s linear, top 0.1s linear"
                      : "none",
                }}
              >
                {showExplosion ? (
                  <span className="animate-explosion" style={{ fontSize: 40 }}>
                    💥
                  </span>
                ) : (
                  <span
                    className={
                      phase === "flying" && isHigh ? "animate-rocket-shake" : ""
                    }
                    style={{
                      display: "block",
                      transform: `rotate(${phase === "waiting" ? 0 : -35}deg)`,
                      filter:
                        phase === "flying"
                          ? `drop-shadow(0 0 ${isHigh ? 14 : 6}px ${isHigh ? "#2AD16B" : "#F5C542"})`
                          : "none",
                    }}
                  >
                    🚀
                  </span>
                )}
              </div>

              {/* Multiplier overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div
                  className={`multiplier-font font-bold leading-none ${
                    phase === "crashed" ? "text-[80px]" : "text-[72px]"
                  } ${multiplierDisplayColor}`}
                  style={{
                    textShadow:
                      phase === "flying"
                        ? `0 0 30px ${isHigh ? "rgba(42,209,107,0.4)" : "rgba(245,197,66,0.4)"}`
                        : phase === "crashed"
                          ? "0 0 30px rgba(255,75,75,0.5)"
                          : "none",
                  }}
                >
                  {formatMult(multiplier)}
                </div>
                <div className="mt-2 text-sm font-semibold tracking-widest uppercase">
                  {phase === "crashed" && (
                    <span className="text-[#FF4B4B] animate-fade-in">
                      CRASHED!
                    </span>
                  )}
                  {phase === "waiting" && (
                    <span className="text-[#8B96AD]">
                      Next round in{" "}
                      <span className="text-[#F5C542] font-bold">
                        {countdown}s
                      </span>
                    </span>
                  )}
                  {phase === "flying" && cashoutMultiplier !== null && (
                    <span className="text-[#2AD16B] animate-fade-in">
                      Cashed out @ {formatMult(cashoutMultiplier)} ✓
                    </span>
                  )}
                  {phase === "flying" &&
                    cashoutMultiplier === null &&
                    currentBet !== null && (
                      <span className="text-[#F5C542]">
                        In flight — Win: ${(currentBet * multiplier).toFixed(2)}
                      </span>
                    )}
                  {phase === "flying" && currentBet === null && (
                    <span className="text-[#8B96AD]">Flying...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Betting controls */}
            <div className="p-4 border-t border-[#22304A]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Multiplier progress */}
                <div className="bg-[#0D1624] rounded-lg p-3">
                  <div className="text-xs text-[#8B96AD] mb-2 font-medium uppercase tracking-wide">
                    Multiplier Progress
                  </div>
                  <div className="h-2 rounded-full bg-[#22304A] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-100"
                      style={{
                        width: `${Math.min(100, ((multiplier - 1) / 9) * 100)}%`,
                        background:
                          phase === "crashed"
                            ? "#FF4B4B"
                            : "linear-gradient(90deg, #FF4B4B, #F5C542, #2AD16B)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-[#8B96AD]">
                    <span>1x</span>
                    <span>5x</span>
                    <span>10x+</span>
                  </div>
                </div>

                {/* Balance card with deposit/withdraw pills */}
                <div className="bg-[#0D1624] rounded-lg p-3">
                  <div className="text-xs text-[#8B96AD] mb-1 font-medium uppercase tracking-wide">
                    Balance
                  </div>
                  <div className="text-2xl font-extrabold text-[#F5C542] multiplier-font">
                    ${balance.toFixed(2)}
                  </div>
                  {currentBet !== null && (
                    <div className="text-xs text-[#8B96AD] mt-1">
                      Bet:{" "}
                      <span className="text-[#F2F5FF]">
                        ${currentBet.toFixed(2)}
                      </span>
                      {cashoutMultiplier !== null && (
                        <span className="text-[#2AD16B] ml-2">
                          Won: +$
                          {(
                            currentBet * cashoutMultiplier -
                            currentBet
                          ).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Quick action pills */}
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => openCashier("deposit")}
                      className="flex-1 py-1 px-2 rounded-full text-xs font-bold bg-[#F5C542]/10 border border-[#F5C542]/30 text-[#F5C542] hover:bg-[#F5C542]/20 transition-colors"
                      data-ocid="balance.deposit.button"
                    >
                      + Deposit
                    </button>
                    <button
                      type="button"
                      onClick={() => openCashier("withdraw")}
                      className="flex-1 py-1 px-2 rounded-full text-xs font-bold bg-[#2AD16B]/10 border border-[#2AD16B]/30 text-[#2AD16B] hover:bg-[#2AD16B]/20 transition-colors"
                      data-ocid="balance.withdraw.button"
                    >
                      − Withdraw
                    </button>
                  </div>
                </div>

                {/* Bet controls */}
                <div className="bg-[#0D1624] rounded-lg p-3">
                  <div className="text-xs text-[#8B96AD] mb-2 font-medium uppercase tracking-wide">
                    Bet Amount
                  </div>
                  <div className="flex gap-1.5 mb-2">
                    {BET_PRESETS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBetAmount(v)}
                        className={`bet-btn flex-1 ${betAmount === v ? "active" : ""}`}
                        data-ocid={`bet.preset_${v}.button`}
                      >
                        ${v}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="Amount"
                      className="flex-1 bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-1.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#F5C542] transition-colors"
                      data-ocid="bet.amount.input"
                    />
                    <input
                      type="number"
                      value={autoCashout}
                      onChange={(e) => setAutoCashout(e.target.value)}
                      placeholder="Auto ×"
                      className="w-20 bg-[#22304A] border border-[#2E3E55] rounded-lg px-3 py-1.5 text-sm text-[#F2F5FF] placeholder-[#8B96AD] focus:outline-none focus:border-[#F5C542] transition-colors"
                      data-ocid="bet.autocashout.input"
                    />
                  </div>
                </div>
              </div>

              {/* Action button */}
              <div className="mt-3">
                {canCashOut ? (
                  <button
                    type="button"
                    onClick={handleCashOut}
                    className="w-full py-3 rounded-xl font-extrabold text-lg bg-[#2AD16B] text-[#0B1220] hover:bg-[#22b85d] transition-colors shadow-lg"
                    style={{ boxShadow: "0 0 20px rgba(42,209,107,0.3)" }}
                    data-ocid="bet.cashout.button"
                  >
                    CASH OUT — ${(currentBet! * multiplier).toFixed(2)}
                  </button>
                ) : canBet ? (
                  <button
                    type="button"
                    onClick={handlePlaceBet}
                    className="w-full py-3 rounded-xl font-extrabold text-lg gold-gradient text-[#0B1220] hover:opacity-90 transition-opacity shadow-lg"
                    data-ocid="bet.place.button"
                  >
                    PLACE BET — $
                    {Number.parseFloat(betAmount || "0").toFixed(2)}
                  </button>
                ) : phase === "waiting" && currentBet !== null ? (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-[#2AD16B] bg-[#2AD16B]/10 border border-[#2AD16B]/30"
                    data-ocid="bet.placed.success_state"
                  >
                    ✓ Bet placed — Waiting for round to start
                  </div>
                ) : phase === "flying" && currentBet === null ? (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-[#8B96AD] bg-[#22304A]/50 border border-[#22304A]"
                    data-ocid="bet.waiting.loading_state"
                  >
                    Place bets in next round
                  </div>
                ) : phase === "flying" && cashoutMultiplier !== null ? (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-[#2AD16B] bg-[#2AD16B]/10 border border-[#2AD16B]/30"
                    data-ocid="bet.cashedout.success_state"
                  >
                    ✓ Cashed out @ {formatMult(cashoutMultiplier)}
                  </div>
                ) : (
                  <div
                    className="w-full py-3 rounded-xl text-center font-bold text-[#FF4B4B] bg-[#FF4B4B]/10 border border-[#FF4B4B]/30"
                    data-ocid="bet.crashed.error_state"
                  >
                    Round ended — preparing next round...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Live Bets Panel */}
          <div className="bg-[#121B2B] border border-[#22304A] rounded-xl overflow-hidden flex flex-col">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <TabsList
                className="w-full rounded-none bg-[#0D1624] border-b border-[#22304A] p-0 h-auto"
                data-ocid="bets.tabs.tab"
              >
                <TabsTrigger
                  value="live"
                  className="flex-1 rounded-none py-3 text-sm font-semibold data-[state=active]:bg-transparent data-[state=active]:text-[#F5C542] data-[state=active]:border-b-2 data-[state=active]:border-[#F5C542] text-[#8B96AD] transition-colors"
                  data-ocid="bets.live.tab"
                >
                  LIVE BETS
                </TabsTrigger>
                <TabsTrigger
                  value="leader"
                  className="flex-1 rounded-none py-3 text-sm font-semibold data-[state=active]:bg-transparent data-[state=active]:text-[#F5C542] data-[state=active]:border-b-2 data-[state=active]:border-[#F5C542] text-[#8B96AD] transition-colors"
                  data-ocid="bets.leaderboard.tab"
                >
                  LEADERBOARD
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="live"
                className="flex-1 overflow-hidden m-0 p-0"
              >
                <ScrollArea className="h-[420px] scrollbar-thin">
                  <div className="p-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2 py-1 text-xs text-[#8B96AD] font-medium uppercase tracking-wide">
                      <span>Player</span>
                      <span className="text-right">Bet</span>
                      <span className="text-right">Mult</span>
                      <span className="text-right">Win</span>
                    </div>
                    {players.map((p, i) => (
                      <div
                        key={p.id}
                        className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2 py-2 rounded-lg hover:bg-[#22304A]/30 transition-colors items-center"
                        data-ocid={`bets.live.item.${i + 1}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-[#0B1220] flex-shrink-0"
                            style={{
                              background: `hsl(${(p.id * 47) % 360} 70% 60%)`,
                            }}
                          >
                            {p.name[0]}
                          </div>
                          <span className="text-xs text-[#F2F5FF] font-medium truncate">
                            {p.name}
                          </span>
                        </div>
                        <span className="text-xs text-[#8B96AD] multiplier-font text-right">
                          ${p.bet}
                        </span>
                        <span
                          className={`text-xs multiplier-font text-right font-semibold ${
                            p.cashedOut
                              ? multColor(p.cashoutMultiplier!)
                              : phase === "flying"
                                ? "text-[#F2F5FF]"
                                : "text-[#8B96AD]"
                          }`}
                        >
                          {p.cashedOut && p.cashoutMultiplier
                            ? formatMult(p.cashoutMultiplier)
                            : phase === "flying"
                              ? formatMult(multiplier)
                              : "—"}
                        </span>
                        <span
                          className={`text-xs multiplier-font text-right font-bold ${
                            p.cashedOut
                              ? "text-[#2AD16B]"
                              : phase === "crashed" && !p.cashedOut
                                ? "text-[#FF4B4B]"
                                : "text-[#8B96AD]"
                          }`}
                        >
                          {p.cashedOut && p.cashoutMultiplier
                            ? `+$${(p.bet * p.cashoutMultiplier).toFixed(0)}`
                            : phase === "crashed" && !p.cashedOut
                              ? "Lost"
                              : phase === "flying"
                                ? `$${(p.bet * multiplier).toFixed(0)}`
                                : `$${p.bet}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="leader"
                className="flex-1 overflow-hidden m-0 p-0"
              >
                <ScrollArea className="h-[420px] scrollbar-thin">
                  <div className="p-2">
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-2 py-1 text-xs text-[#8B96AD] font-medium uppercase tracking-wide">
                      <span>#</span>
                      <span>Player</span>
                      <span className="text-right">Bet</span>
                      <span className="text-right">Mult</span>
                      <span className="text-right">Win</span>
                    </div>
                    {INITIAL_WINNERS.map((w, i) => (
                      <div
                        key={`${w.name}-${w.win}`}
                        className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-2 py-2 rounded-lg hover:bg-[#22304A]/30 items-center"
                        data-ocid={`leader.item.${i + 1}`}
                      >
                        <span
                          className={`text-xs font-bold w-5 text-center ${
                            i === 0
                              ? "text-[#F5C542]"
                              : i === 1
                                ? "text-gray-300"
                                : i === 2
                                  ? "text-[#CD7F32]"
                                  : "text-[#8B96AD]"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="text-xs text-[#F2F5FF] font-medium">
                          {w.name}
                        </span>
                        <span className="text-xs text-[#8B96AD] multiplier-font text-right">
                          ${w.bet}
                        </span>
                        <span
                          className={`text-xs multiplier-font font-semibold text-right ${multColor(w.multiplier)}`}
                        >
                          {formatMult(w.multiplier)}
                        </span>
                        <span className="text-xs text-[#2AD16B] font-bold multiplier-font text-right">
                          +${w.win}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Bottom sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Top Winners */}
          <div
            className="bg-[#121B2B] border border-[#22304A] rounded-xl p-4"
            data-ocid="winners.card"
          >
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#F5C542] mb-3">
              🏆 Top Winners
            </h3>
            <div className="space-y-2">
              {INITIAL_WINNERS.slice(0, 5).map((w, i) => (
                <div
                  key={`winner-${w.name}-${w.win}`}
                  className="flex items-center justify-between py-1.5 border-b border-[#22304A]/50 last:border-0"
                  data-ocid={`winners.item.${i + 1}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold w-4 ${
                        i === 0
                          ? "text-[#F5C542]"
                          : i === 1
                            ? "text-gray-300"
                            : i === 2
                              ? "text-[#CD7F32]"
                              : "text-[#8B96AD]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-[#F2F5FF]">
                      {w.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold multiplier-font ${multColor(w.multiplier)}`}
                    >
                      {formatMult(w.multiplier)}
                    </span>
                    <span className="text-sm font-bold text-[#2AD16B] multiplier-font">
                      +${w.win.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Crashes */}
          <div
            className="bg-[#121B2B] border border-[#22304A] rounded-xl p-4"
            data-ocid="crashes.card"
          >
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#F5C542] mb-3">
              💥 Recent Crashes
            </h3>
            <div className="flex flex-wrap gap-2">
              {recentCrashes.slice(0, 16).map((c) => (
                <span
                  key={c.id}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold multiplier-font ${crashBadgeColor(c.multiplier)}`}
                >
                  {formatMult(c.multiplier)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* How to Play */}
        <section className="mt-4" data-ocid="howtoplay.section">
          <div className="bg-[#121B2B] border border-[#22304A] rounded-xl p-6">
            <h3 className="text-lg font-bold text-[#F5C542] mb-4">
              🎮 How to Play
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  title: "Place Your Bet",
                  desc: "Enter your bet amount before the round starts. Use preset buttons or type a custom amount. Set an auto cashout multiplier to cash out automatically.",
                  icon: "💰",
                },
                {
                  step: "2",
                  title: "Watch the Rocket",
                  desc: "The rocket launches and the multiplier starts climbing from 1.00x. The higher it goes, the more you can win — but it can crash at any moment!",
                  icon: "🚀",
                },
                {
                  step: "3",
                  title: "Cash Out in Time",
                  desc: "Hit Cash Out before the rocket crashes to claim your winnings. If the rocket crashes before you cash out, you lose your bet. Timing is everything!",
                  icon: "⚡",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-[#0D1624] rounded-xl p-4 border border-[#22304A]"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <span className="text-xs text-[#8B96AD] font-semibold">
                        STEP {item.step}
                      </span>
                      <h4 className="font-bold text-[#F2F5FF]">{item.title}</h4>
                    </div>
                  </div>
                  <p className="text-sm text-[#8B96AD] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#22304A] mt-6">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold text-[#F5C542]">
                🚀 AVIOROCKET
              </span>
              <span className="text-[#8B96AD] text-sm">
                — Play responsibly. 18+ only.
              </span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-[#8B96AD]">
              {["Terms", "Privacy", "Support"].map((link) => (
                <button
                  key={link}
                  type="button"
                  className="hover:text-[#F2F5FF] transition-colors"
                >
                  {link}
                </button>
              ))}
            </nav>
            <p className="text-[#8B96AD] text-xs">
              &copy; {new Date().getFullYear()}. Built with ❤️ using{" "}
              <a
                href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
                className="text-[#F5C542] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                caffeine.ai
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
