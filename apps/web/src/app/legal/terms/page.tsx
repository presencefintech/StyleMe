import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, CONTACT_EMAIL, LegalPage, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation · StyleMe" };

// Modèle de texte à faire relire par un juriste avant l'ouverture au public (identité de l'exploitant, droit applicable).
export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation">
      <p className="text-ink-muted">En créant un compte, vous acceptez ces conditions. Elles sont courtes, lisez-les.</p>

      <Section title="Le service">
        <p className="text-ink-muted">
          StyleMe permet de retoucher des photos avec l'IA : nettoyage et fond de studio, décors d'occasion, retouche par instruction écrite, et gomme d'objets. Les résultats sont générés automatiquement : ils peuvent être imparfaits, et nous ne garantissons pas un résultat précis.
        </p>
      </Section>

      <Section title="Votre compte">
        <Bullets
          items={[
            "Vous avez 18 ans ou plus.",
            "Vous gardez votre mot de passe secret et vous êtes responsable de l'usage de votre compte.",
            "Vous pouvez supprimer votre compte à tout moment depuis la page Mon compte.",
          ]}
        />
      </Section>

      <Section title="Crédits et paiements">
        <Bullets
          items={[
            "Chaque retouche coûte un nombre de crédits affiché avant de la lancer.",
            "Vous n'êtes débité que si le résultat vous est livré : en cas d'échec ou de refus, aucun crédit n'est débité.",
            "Les crédits achetés par Mobile Money ne sont pas remboursables une fois crédités sur votre compte, sauf obligation légale.",
          ]}
        />
      </Section>

      <Section title="Ce que vous pouvez envoyer">
        <p className="text-ink-muted">Vous ne devez envoyer que des photos de vous, ou de personnes adultes qui ont donné leur accord. Il est interdit d'envoyer ou de produire :</p>
        <Bullets
          items={[
            "des images de personnes mineures ;",
            "des contenus sexuels, violents, haineux ou illégaux ;",
            "des montages destinés à tromper, humilier ou usurper l'identité d'une personne ;",
            "des photos que vous n'avez pas le droit d'utiliser.",
          ]}
        />
        <p className="text-ink-muted">Une modération automatique peut refuser une photo. Nous pouvons suspendre ou supprimer un compte qui enfreint ces règles.</p>
      </Section>

      <Section title="Vos photos">
        <p className="text-ink-muted">
          Vos photos et vos résultats restent les vôtres. Vous nous autorisez seulement à les traiter pour vous fournir le service. Elles sont supprimées automatiquement au bout de quelques jours, comme expliqué dans la{" "}
          <Link href="/legal/privacy" className="font-semibold text-primary underline-offset-2 hover:underline">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section title="Responsabilité">
        <p className="text-ink-muted">
          Le service est fourni « tel quel ». Dans les limites permises par la loi, nous ne sommes pas responsables des dommages indirects liés à l'usage du service, ni de l'usage que vous faites des images générées.
        </p>
      </Section>

      <Section title="Contact">
        <p className="text-ink-muted">
          {CONTACT_EMAIL ? (
            <>
              Une question ? Écrivez à <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline-offset-2 hover:underline">{CONTACT_EMAIL}</a>.
            </>
          ) : (
            "Une question ? Contactez-nous via les coordonnées indiquées lors de votre inscription."
          )}
        </p>
      </Section>
    </LegalPage>
  );
}
