import { describe, expect, it } from "vitest";
import { signInitData, verifyInitData } from "../src/telegram";

const TOKEN = "123456:TEST-bot-token-not-real";

describe("verifyInitData", () => {
  it("accepts valid data and returns the user", () => {
    const u = verifyInitData(signInitData({ id: 42, username: "ada" }, TOKEN), TOKEN, 3600);
    expect(u).toEqual({ id: "42", username: "ada", firstName: undefined });
  });
  it("rejects a tampered payload", () => {
    const good = signInitData({ id: 42 }, TOKEN);
    const bad = good.replace("%22id%22%3A42", "%22id%22%3A43");
    expect(bad).not.toBe(good);
    expect(() => verifyInitData(bad, TOKEN, 3600)).toThrow(/bad signature/);
  });
  it("rejects data signed with another bot token", () => {
    expect(() => verifyInitData(signInitData({ id: 1 }, "999:other-token-xxxx"), TOKEN, 3600)).toThrow(/bad signature/);
  });
  it("rejects expired and future-dated data", () => {
    const old = signInitData({ id: 1 }, TOKEN, Math.floor(Date.now() / 1000) - 7200);
    expect(() => verifyInitData(old, TOKEN, 3600)).toThrow(/expired/);
    const future = signInitData({ id: 1 }, TOKEN, Math.floor(Date.now() / 1000) + 3600);
    expect(() => verifyInitData(future, TOKEN, 3600)).toThrow(/expired/);
  });
  it("rejects missing hash", () => {
    expect(() => verifyInitData("auth_date=1&user=%7B%7D", TOKEN, 3600)).toThrow(/missing hash/);
  });
});
