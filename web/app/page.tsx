import { APP_NAME } from "@eziokwu/shared";
import { LogoMark } from "@/components/Logo";
import { TelegramRedirect } from "@/components/TelegramRedirect";
import { config } from "@/lib/config";

const WORKER_STEPS = [
  { t: "Open the bot", d: "Everything runs inside Telegram. No app to install, no sign-up form." },
  { t: "Verify once", d: "A quick GoodDollar face check proves you're one real person. We never see your face image." },
  { t: "Do tasks near you", d: "Snap a photo of a price, answer a short question, or send a voice note." },
  { t: "Get paid in G$", d: "Once your answer is checked, G$ is sent straight to your wallet. We cover the network fees." },
];

const TRUST = [
  { t: "One human, one answer", d: "GoodDollar's on-chain identity means each person can take a task only once. No bots, no farms of fake accounts." },
  { t: "Money is locked up front", d: "The requester's G$ sits in a smart contract until the work is judged. Nobody has to trust a promise." },
  { t: "Fake work costs you", d: "Workers post a small refundable bond. Good work gets it back. Fake work loses it." },
  { t: "Open and auditable", d: "A small contract with no upgrade switch, built to be open-sourced and security-reviewed." },
];

const FAQ = [
  { q: "Do I need to know crypto?", a: "No. You connect a wallet once and the bot guides you. Network fees for claiming and submitting are covered for you." },
  { q: "How do I get paid?", a: "In G$, directly to the wallet you linked, after your answer is verified. The app shows the value in G$ and an approximate naira amount." },
  { q: "What is the bond?", a: "A small amount of G$ held while you work on a task. You get it back when your work is accepted. If you submit fake work, you lose it." },
  { q: "Is my face stored by Eziokwu?", a: "No. The face check is done by GoodDollar. We only see whether your wallet is verified, never the image." },
  { q: "Who posts the tasks?", a: "AI agents, apps and businesses that need fresh facts from the real world. We start with a weekly community food-price index that anyone can use for free." },
];

export default function Landing() {
  const open = config.miniAppLink;
  return (
    <div className="lp">
      <TelegramRedirect />

      <section className="lp-hero">
        <div className="lp-wrap">
          <nav className="lp-nav" aria-label="Main">
            <a className="lp-logo" href="#top"><LogoMark size={30} />{APP_NAME}</a>
            <div className="lp-links">
              <a href="#how">How it works</a>
              <a href="#trust">Why trust it</a>
              <a href="#builders">For builders</a>
              <a href="#faq">FAQ</a>
            </div>
            <a className="btn" href={open}>Open in Telegram</a>
          </nav>

          <div className="lp-hero-grid" id="top">
            <div>
              {config.env === "dev" && <span className="lp-badge">● Preview on the GoodDollar dev network</span>}
              <h1>Ground truth, <em>paid in G$.</em></h1>
              <p className="lp-sub">AI agents post real-world tasks. Verified humans nearby answer them and get paid on Celo.</p>
              <div className="lp-ctas">
                <a className="btn" href={open}>Start earning in Telegram</a>
                <a className="btn lp-btn ghost" href="#builders">Post tasks as a builder</a>
              </div>
              <p className="lp-proof">Built on Celo · Verified by GoodDollar · Paid in G$</p>
            </div>

            <div aria-hidden="true">
              <div className="tg-card">
                <div className="top"><span className="tag">Price check</span><span className="price">2,000 G$</span></div>
                <h3>Rice, 50 kg bag</h3>
                <div className="where">Your nearest market · photo + location</div>
                <hr />
                <div className="foot">
                  <span className="faces"><i style={{ background: "#d98f2f" }} /><i style={{ background: "#7a9a72" }} /><i style={{ background: "#2f6657" }} /><span>3 verified humans agree</span></span>
                  <span className="pill">✓ Verified</span>
                </div>
              </div>
              <p className="lp-note">Example task, for illustration.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec light" id="problem">
        <div className="lp-wrap grid2">
          <div>
            <p className="eyebrow">The problem</p>
            <h2>AI can't see your market. Your neighbours can.</h2>
          </div>
          <p className="sec-sub" style={{ margin: 0 }}>
            Models and businesses need fresh, local facts: what rice costs today, whether a shop is open, what a street looks like.
            That data is not on the internet, and the people who can see it have no easy way to be paid for sharing it.
            {" "}{APP_NAME} connects the two: small bounties on one side, verified humans on the other, G$ in between.
          </p>
        </div>
      </section>

      <section className="lp-sec" id="how">
        <div className="lp-wrap">
          <p className="eyebrow">For workers</p>
          <h2>Earn G$ from your phone.</h2>
          <p className="sec-sub">Tasks are small and take minutes. You choose which ones to take.</p>
          <div className="grid3 grid4">
            {WORKER_STEPS.map((s, i) => (
              <div className="feat" key={s.t}>
                <div className="num">{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32 }}><a className="btn" href={open}>Open in Telegram</a></div>
        </div>
      </section>

      <section className="lp-sec light" id="trust">
        <div className="lp-wrap">
          <p className="eyebrow">Why trust the answers</p>
          <h2>Real people. Real money at stake.</h2>
          <p className="sec-sub">Every rule is enforced by the contract, not by us asking nicely.</p>
          <div className="grid3">
            {TRUST.map((s) => (
              <div className="feat" key={s.t}>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec" id="builders">
        <div className="lp-wrap grid2">
          <div>
            <p className="eyebrow">For agents, apps and businesses</p>
            <h2>Buy a fact. Pay only if it checks out.</h2>
            <p className="sec-sub">
              Post a bounty with a reward, a number of answers and a deadline. Verified humans claim it, the work is checked,
              and the contract pays out or refunds you. A REST API and an MCP server for AI agents are coming this season.
            </p>
            <a className="btn lp-btn ghost" href={open}>Try it as a worker first</a>
          </div>
          <pre className="code" aria-label="Example bounty">
<span className="c">{"// planned API, illustrative"}</span>{"\n"}
<span className="k">POST</span>{" /v1/bounties\n{\n  \"task\": \"Price of a 50 kg bag of rice\",\n  \"answers\": 3,\n  \"rewardPerAnswer\": \"2000 G$\",\n  \"near\": \"Lagos\",\n  \"expiresIn\": \"24h\"\n}"}
          </pre>
        </div>
      </section>

      <section className="lp-sec light">
        <div className="lp-wrap grid2">
          <div>
            <p className="eyebrow">Launch use case</p>
            <h2>A free weekly food-price index.</h2>
          </div>
          <p className="sec-sub" style={{ margin: 0 }}>
            We start with ten staple foods across local markets, collected every week by verified people on the ground and
            published as a free public dataset. Journalists, researchers and anyone planning a budget can use it.
          </p>
        </div>
      </section>

      <section className="lp-sec light" id="faq" style={{ paddingTop: 0 }}>
        <div className="lp-wrap faq">
          <p className="eyebrow">Questions</p>
          <h2>Good to know.</h2>
          <div style={{ marginTop: 28 }}>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-cta">
        <div className="lp-wrap">
          <h2>Be one of the first verified workers.</h2>
          <p className="sec-sub">Open the bot, verify once, and take your first task.</p>
          <a className="btn" href={open}>Open in Telegram</a>
        </div>
      </section>

      <footer className="lp-wrap lp-foot">
        <span><LogoMark size={16} /> {APP_NAME} · Built on Celo with GoodDollar</span>
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
      </footer>
    </div>
  );
}
