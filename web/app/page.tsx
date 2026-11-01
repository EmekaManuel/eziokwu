"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_NAME } from "@eziokwu/shared";
import { useMe } from "@/lib/useMe";
import { getInitData } from "@/lib/telegram";

function Step({ n, done, title, href, hint }: { n: number; done: boolean; title: string; href: string; hint: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div className="card step">
        <span className={`dot ${done ? "done" : ""}`}>{done ? "✓" : n}</span>
        <div>
          <strong>{title}</strong>
          <div className="hint">{hint}</div>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const { data: me, isLoading, error } = useMe();
  const router = useRouter();
  const [taskId, setTaskId] = useState("");
  // Decided after mount: Telegram data only exists in the browser, so rendering it on the server would mismatch.
  const [outsideTelegram, setOutsideTelegram] = useState(false);
  useEffect(() => setOutsideTelegram(!getInitData()), []);

  return (
    <>
      <h1>{APP_NAME}</h1>
      <p className="hint">Get paid in G$ for real-world facts near you.</p>

      {outsideTelegram && <p className="err">Open this page from the {APP_NAME} Telegram bot.</p>}
      {isLoading && <p className="hint">Loading…</p>}
      {error && <p className="err">{(error as Error).message}</p>}

      {me && (
        <>
          <Step n={1} done={me.linked} title="Link your wallet" href="/link" hint="Prove the wallet is yours." />
          <Step n={2} done={!!me.verified} title="Verify you're a real person" href="/verify" hint="GoodDollar face verification." />
          <Step n={3} done={!!me.approved} title="Allow G$ for task deposits" href="/approve" hint="One-time. Needed for the refundable bond." />
          {me.linked && me.verified && me.approved && (
            <div className="card">
              <strong>You're ready 🎉</strong>
              <p className="hint">Send /tasks to the bot to see tasks near you, or open one by number:</p>
              <input inputMode="numeric" placeholder="Task number" value={taskId} onChange={(e) => setTaskId(e.target.value.replace(/\D/g, ""))} />
              <button disabled={!taskId} onClick={() => router.push(`/task/${taskId}`)}>
                Open task
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
