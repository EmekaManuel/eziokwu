import { APP_NAME } from "@eziokwu/shared";
import { config } from "@/lib/config";

const STEPS = [
  { title: "Open the bot", text: "Everything happens inside Telegram. No app to install." },
  { title: "Verify once", text: "A quick GoodDollar face check proves you're one real person." },
  { title: "Do tasks, get paid", text: "Snap a price, answer a question, or send a voice note. Paid in G$ when it's checked." },
];

/** Shown when the page is opened in a normal browser instead of inside Telegram. */
export function Landing() {
  return (
    <section className="landing">
      <h1>{APP_NAME}</h1>
      <p className="tagline">Get paid in G$ for real-world facts near you.</p>
      <a className="btn cta" href={config.miniAppLink}>
        Open in Telegram
      </a>
      <p className="hint">This page works inside the Telegram bot. The button takes you there.</p>
      <ol className="how">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card step">
            <span className="dot">{i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <div className="hint">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="hint foot">Built on Celo with GoodDollar.</p>
    </section>
  );
}
