"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { config } from "@/lib/config";
import { getInitData } from "@/lib/telegram";
import { useMe } from "@/lib/useMe";

function Step({ n, done, locked, title, href, hint }: { n: number; done: boolean; locked: boolean; title: string; href: string; hint: string }) {
  const body = (
    <div className={`card step ${done ? "is-done" : ""} ${locked ? "is-locked" : ""}`}>
      <span className={`dot ${done ? "done" : ""}`}>{done ? "✓" : n}</span>
      <div className="step-body">
        <strong>{title}</strong>
        <div className="hint">{done ? "Done" : hint}</div>
      </div>
      {!done && !locked && <span className="chev" aria-hidden="true">›</span>}
    </div>
  );
  return locked ? body : <Link href={href}>{body}</Link>;
}

export default function Home() {
  const { data: me, isLoading, error } = useMe();
  const router = useRouter();
  const [taskId, setTaskId] = useState("");
  // Decided after mount: Telegram data only exists in the browser, so rendering it on the server would mismatch.
  const [outsideTelegram, setOutsideTelegram] = useState<boolean>();
  useEffect(() => setOutsideTelegram(!getInitData()), []);

  if (outsideTelegram === undefined) return null;
  if (outsideTelegram)
    return (
      <div className="center">
        <LogoMark size={44} />
        <h1>Open this in Telegram</h1>
        <p className="hint">The app only works inside the Telegram bot, because that's where your account is verified.</p>
        <a className="btn" href={config.miniAppLink}>Open in Telegram</a>
      </div>
    );

  const done = [me?.linked, me?.verified, me?.approved].filter(Boolean).length;
  const ready = done === 3;

  return (
    <>
      <h1>{ready ? "You're all set" : "Let's get you set up"}</h1>
      <p className="hint">{ready ? "Pick a task and start earning G$." : "Three quick steps, once. Then you can start earning G$."}</p>

      {isLoading && <div className="card skeleton" aria-busy="true">Loading…</div>}
      {error && (
        <div className="card err-card">
          <strong>Can't reach the server</strong>
          <p className="hint">{(error as Error).message}</p>
          <button className="secondary" onClick={() => location.reload()}>Try again</button>
        </div>
      )}

      {me && (
        <>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done} aria-label="Setup progress">
            <span style={{ width: `${(done / 3) * 100}%` }} />
          </div>
          <p className="progress-label">{done} of 3 done</p>

          <Step n={1} done={!!me.linked} locked={false} title="Link your wallet" href="/link" hint="Prove the wallet is yours." />
          <Step n={2} done={!!me.verified} locked={!me.linked} title="Verify you're a real person" href="/verify" hint="A quick GoodDollar face check." />
          <Step n={3} done={!!me.approved} locked={!me.verified} title="Allow G$ for task deposits" href="/approve" hint="One time. Covers the refundable bond." />

          {ready && (
            <div className="card">
              <strong>Find a task</strong>
              <p className="hint">Send /tasks to the bot to see tasks near you, or open one by its number.</p>
              <label htmlFor="task-number">Task number</label>
              <input id="task-number" inputMode="numeric" placeholder="e.g. 12" value={taskId} onChange={(e) => setTaskId(e.target.value.replace(/\D/g, ""))} />
              <button disabled={!taskId} onClick={() => router.push(`/task/${taskId}`)}>Open task</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
