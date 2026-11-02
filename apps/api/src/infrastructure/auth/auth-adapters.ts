import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { JwtService } from "@nestjs/jwt";
import type { PasswordHasher, TokenService } from "../../domain/ports";

const KEY_LEN = 64;
const SCRYPT: ScryptOptions = { N: 16384, r: 8, p: 1 };

const derive = (plain: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(plain.normalize("NFKC"), salt, KEY_LEN, SCRYPT, (e, key) => (e ? reject(e) : resolve(key))),
  );

/** scrypt avec sel aléatoire. Format stocké : `scrypt$<sel hex>$<hash hex>`. */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string) {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${(await derive(plain, salt)).toString("hex")}`;
  }

  async verify(plain: string, stored: string) {
    const [scheme, saltHex, hashHex] = stored.split("$");
    // Hash absent/malformé : on dérive quand même pour garder un temps de réponse comparable.
    const valid = scheme === "scrypt" && !!saltHex && !!hashHex;
    const salt = valid ? Buffer.from(saltHex, "hex") : Buffer.alloc(16);
    const expected = valid ? Buffer.from(hashHex, "hex") : Buffer.alloc(KEY_LEN);
    const actual = await derive(plain, salt);
    return valid && expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}
  issue(userId: string) {
    return this.jwt.signAsync({ sub: userId }, { expiresIn: "30d" });
  }
}
