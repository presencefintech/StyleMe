import { describe, expect, it } from "vitest";
import { REFERRAL } from "@styleme/shared";
import { FakePasswordHasher, FakeTokenService, FixedClock, InMemoryCreditLedger, InMemoryUserRepository, SequentialIdGenerator } from "../../__fakes__";
import { EmailAlreadyUsed, InvalidCredentials, InvalidEmail, WeakPassword } from "../../../domain/errors";
import { ConfirmAge } from "./confirm-age";
import { Login } from "./login";
import { GetReferralInfo } from "../credits/get-referral-info";
import { Register } from "./register";

function setup() {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new FakeTokenService();
  const ledger = new InMemoryCreditLedger();
  return {
    users,
    ledger,
    register: new Register(users, hasher, tokens, new SequentialIdGenerator(), ledger),
    login: new Login(users, hasher, tokens),
    confirm: new ConfirmAge(users, new FixedClock()),
  };
}

describe("Register", () => {
  it("crée un compte, hashe le mot de passe et renvoie un token", async () => {
    const s = setup();
    const r = await s.register.execute({ email: "  Jean@Example.com ", password: "motdepasse1" });
    expect(r.ok && r.value.user.email.value).toBe("jean@example.com");
    expect(r.ok && r.value.accessToken).toBe("token_id_1");
    expect(r.ok && r.value.user.passwordHash).not.toBe("motdepasse1"); // jamais le mot de passe en clair
    expect(s.users.items.size).toBe(1);
  });
  it("refuse un email déjà utilisé (insensible à la casse)", async () => {
    const s = setup();
    await s.register.execute({ email: "a@b.co", password: "motdepasse1" });
    const r = await s.register.execute({ email: "A@B.CO", password: "autrepasse1" });
    expect(!r.ok && r.error).toBeInstanceOf(EmailAlreadyUsed);
    expect(s.users.items.size).toBe(1);
  });
  it("refuse un mot de passe trop court et un email invalide", async () => {
    const s = setup();
    const weak = await s.register.execute({ email: "a@b.co", password: "court" });
    const bad = await s.register.execute({ email: "pas-un-email", password: "motdepasse1" });
    expect(!weak.ok && weak.error).toBeInstanceOf(WeakPassword);
    expect(!bad.ok && bad.error).toBeInstanceOf(InvalidEmail);
    expect(s.users.items.size).toBe(0);
  });
});

describe("Register — crédits offerts et parrainage", () => {
  const pw = "motdepasse1";
  it("offre le bonus d'inscription à tout nouveau compte, sans code", async () => {
    const s = setup();
    const r = await s.register.execute({ email: "a@b.co", password: pw });
    expect(r.ok && (await s.ledger.balanceOf(r.value.user.id)).value).toBe(REFERRAL.signupBonus);
    expect(r.ok && r.value.user.referralCode).toMatch(/^[A-Z0-9]+$/);
  });
  it("récompense le parrain quand un code valide est utilisé (insensible à la casse)", async () => {
    const s = setup();
    const parrain = await s.register.execute({ email: "p@b.co", password: pw });
    if (!parrain.ok) throw new Error("setup");
    const filleul = await s.register.execute({ email: "f@b.co", password: pw, referralCode: ` ${parrain.value.user.referralCode.toLowerCase()} ` });
    expect(filleul.ok && filleul.value.user.referredById).toBe(parrain.value.user.id);
    expect((await s.ledger.balanceOf(parrain.value.user.id)).value).toBe(REFERRAL.signupBonus + REFERRAL.referrerBonus);
    expect(filleul.ok && (await s.ledger.balanceOf(filleul.value.user.id)).value).toBe(REFERRAL.signupBonus);
  });
  it("ignore un code inconnu sans bloquer l'inscription ni créditer personne d'autre", async () => {
    const s = setup();
    const r = await s.register.execute({ email: "a@b.co", password: pw, referralCode: "INCONNU" });
    expect(r.ok && r.value.user.referredById).toBeUndefined();
    expect(s.ledger.entries).toHaveLength(1);
  });
  it("ne récompense plus le parrain au-delà du plafond, mais le filleul garde son bonus", async () => {
    const s = setup();
    const parrain = await s.register.execute({ email: "p@b.co", password: pw });
    if (!parrain.ok) throw new Error("setup");
    const total = REFERRAL.maxRewardedReferrals + 2;
    for (let i = 0; i < total; i++) {
      const r = await s.register.execute({ email: `f${i}@b.co`, password: pw, referralCode: parrain.value.user.referralCode });
      expect(r.ok && (await s.ledger.balanceOf(r.value.user.id)).value).toBe(REFERRAL.signupBonus);
    }
    const expected = REFERRAL.signupBonus + REFERRAL.maxRewardedReferrals * REFERRAL.referrerBonus;
    expect((await s.ledger.balanceOf(parrain.value.user.id)).value).toBe(expected);
  });
  it("GetReferralInfo renvoie le code et le nombre de filleuls", async () => {
    const s = setup();
    const parrain = await s.register.execute({ email: "p@b.co", password: pw });
    if (!parrain.ok) throw new Error("setup");
    await s.register.execute({ email: "f@b.co", password: pw, referralCode: parrain.value.user.referralCode });
    const info = await new GetReferralInfo(s.users).execute(parrain.value.user.id);
    expect(info.ok && info.value).toMatchObject({ code: parrain.value.user.referralCode, referrals: 1, referrerBonus: REFERRAL.referrerBonus });
  });
});

describe("Login", () => {
  it("connecte avec le bon mot de passe (email normalisé)", async () => {
    const s = setup();
    await s.register.execute({ email: "a@b.co", password: "motdepasse1" });
    const r = await s.login.execute({ email: " A@b.co", password: "motdepasse1" });
    expect(r.ok && r.value.user.email.value).toBe("a@b.co");
  });
  it("même erreur pour mauvais mot de passe, compte inconnu et email invalide", async () => {
    const s = setup();
    await s.register.execute({ email: "a@b.co", password: "motdepasse1" });
    for (const input of [
      { email: "a@b.co", password: "mauvais-mdp" },
      { email: "inconnu@b.co", password: "motdepasse1" },
      { email: "nimporte", password: "motdepasse1" },
    ]) {
      const r = await s.login.execute(input);
      expect(!r.ok && r.error).toBeInstanceOf(InvalidCredentials);
    }
  });
});

describe("ConfirmAge", () => {
  it("pose la date de confirmation", async () => {
    const s = setup();
    const v = await s.register.execute({ email: "a@b.co", password: "motdepasse1" });
    if (!v.ok) throw v.error;
    expect(v.value.user.isAgeConfirmed).toBe(false);
    await s.confirm.execute({ userId: v.value.user.id });
    expect((await s.users.findById(v.value.user.id))?.isAgeConfirmed).toBe(true);
  });
});
