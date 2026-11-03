import type { Metadata } from "next";
import Link from "next/link";
import { RESULT_RETENTION_DAYS, SOURCE_RETENTION_DAYS } from "@styleme/shared";
import { Bullets, CONTACT_EMAIL, LegalPage, Section } from "@/components/legal";

export const metadata: Metadata = { title: "Confidentialité · StyleMe" };

// Modèle de texte à faire relire par un juriste avant l'ouverture au public (identité de l'exploitant, droit applicable).
export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p className="text-ink-muted">
        StyleMe retouche vos photos avec de l'intelligence artificielle. Voici, simplement, ce que nous collectons, pourquoi, combien de temps nous le gardons, et comment tout effacer.
      </p>

      <Section title="Ce que nous collectons">
        <Bullets
          items={[
            "Votre adresse email et votre mot de passe (conservé uniquement sous forme chiffrée : nous ne pouvons pas le lire).",
            "La confirmation que vous avez 18 ans ou plus.",
            "Les photos que vous envoyez, les résultats générés, et les instructions écrites que vous donnez à l'IA.",
            "Votre historique de crédits et de paiements. Pour un paiement Mobile Money, votre numéro est transmis au prestataire de paiement pour effectuer l'opération.",
          ]}
        />
      </Section>

      <Section title="Pourquoi">
        <p className="text-ink-muted">
          Uniquement pour fournir le service : créer votre compte, retoucher vos photos, gérer vos crédits et traiter vos paiements, et protéger la plateforme contre les contenus interdits. Nous ne vendons pas vos données et nous ne les utilisons pas pour entraîner des modèles d'IA.
        </p>
      </Section>

      <Section title="Combien de temps nous gardons vos photos">
        <Bullets
          items={[
            <>Photos que vous envoyez : supprimées automatiquement au bout de <strong className="text-ink">{SOURCE_RETENTION_DAYS} jours</strong>.</>,
            <>Résultats et historique des retouches : supprimés automatiquement au bout de <strong className="text-ink">{RESULT_RETENTION_DAYS} jours</strong>. Téléchargez vos résultats avant cette date.</>,
            "Suppression immédiate de votre compte : toutes vos photos et votre historique sont effacés au moment où vous le demandez.",
            "Les écritures comptables (achats de crédits) sont conservées, sans votre numéro de téléphone, car la loi nous y oblige.",
          ]}
        />
      </Section>

      <Section title="Qui traite vos données">
        <p className="text-ink-muted">Pour faire fonctionner StyleMe, nous faisons appel à des prestataires techniques :</p>
        <Bullets
          items={[
            "un hébergeur de base de données et de stockage de fichiers (vos photos sont dans un espace privé, accessibles uniquement par des liens temporaires) ;",
            "un hébergeur d'applications ;",
            "un fournisseur d'IA, à qui la photo concernée est envoyée le temps de la retouche ;",
            "un prestataire de paiement Mobile Money ;",
            "un outil de suivi des erreurs techniques, configuré pour ne recevoir ni vos photos, ni votre email, ni vos instructions.",
          ]}
        />
        <p className="text-ink-muted">Certains de ces prestataires sont situés hors de votre pays, en Europe ou aux États-Unis.</p>
      </Section>

      <Section title="Vos droits">
        <p className="text-ink-muted">
          Vous pouvez supprimer votre compte et toutes vos photos à tout moment depuis la page{" "}
          <Link href="/account" className="font-semibold text-primary underline decoration-accent decoration-2 underline-offset-2 hover:bg-accent">Mon compte</Link>.
          Pour consulter ou corriger vos données, ou pour toute question, écrivez-nous
          {CONTACT_EMAIL ? (
            <>
              {" "}à <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline decoration-accent decoration-2 underline-offset-2 hover:bg-accent">{CONTACT_EMAIL}</a>.
            </>
          ) : (
            "."
          )}
        </p>
      </Section>

      <Section title="Mineurs">
        <p className="text-ink-muted">StyleMe est réservé aux personnes de 18 ans ou plus. N'envoyez jamais de photo d'une personne mineure ni d'une personne qui n'a pas donné son accord.</p>
      </Section>
    </LegalPage>
  );
}
