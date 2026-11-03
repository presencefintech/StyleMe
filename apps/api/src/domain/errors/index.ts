export class DomainError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class InsufficientCredits extends DomainError {}
export class ModerationRejected extends DomainError {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
export class JobNotFound extends DomainError {}
export class InvalidJobTransition extends DomainError {
  constructor(from: string, expected: string) {
    super(`Invalid job transition from ${from}, expected ${expected}`);
  }
}
export class InvalidPaymentTransition extends DomainError {}
export class PaymentNotFound extends DomainError {}
export class PackNotFound extends DomainError {}
export class InvalidPaymentSignature extends DomainError {}
export class InvalidCredentials extends DomainError {}
/** Mot de passe de confirmation incorrect (action sensible). Distinct de InvalidCredentials : ne déconnecte pas. */
export class PasswordMismatch extends DomainError {}
export class EmailAlreadyUsed extends DomainError {}
export class InvalidEmail extends DomainError {}
export class WeakPassword extends DomainError {}
export class InvalidPhoneNumber extends DomainError {}
export class AgeNotConfirmed extends DomainError {}
export class UserNotFound extends DomainError {}
export class ProviderFailure extends DomainError {}
export class AssetNotFound extends DomainError {}
/** Tenue inconnue ou retirée du catalogue. */
export class GarmentNotFound extends DomainError {}
export class InvalidPrompt extends DomainError {}
/** Le fournisseur d'IA a refusé le contenu (filtre de sécurité) : définitif, inutile de réessayer. */
export class ProviderRejectedContent extends DomainError {}
/** Aucun objet detectable sous le clic. */
export class NoObjectFound extends DomainError {}
/** Image illisible ou non supportée. */
export class InvalidImage extends DomainError {}
/** La sélection n'existe plus (expirée ou service redémarré) : il faut toucher à nouveau l'objet. */
export class SelectionExpired extends DomainError {}
