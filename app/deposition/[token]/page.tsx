/** Verify the token on the server before rendering questions. A bad link never receives the deposition room. */
import { DepositionRoom } from "@/components/deposition-room";
import { readWitnessToken } from "@/lib/witness";

export const dynamic = "force-dynamic";

export default async function DepositionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const status = readWitnessToken(decoded);
  if (status === "tampered" || status === "expired") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-serif text-4xl">Link closed</h1>
        <p className="mt-4 text-muted-foreground">
          {status === "expired" ? "This deposition link has expired." : "This deposition link is not valid."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Deposition</p>
      <h1 className="mt-2 font-serif text-4xl">Call the witness</h1>
      <DepositionRoom token={decoded} />
      <footer className="mt-10 border-t py-6 text-sm text-muted-foreground">
        Synthetic demo data. Audio is not stored. Nothing is filed until you click Sign ruling.
      </footer>
    </main>
  );
}
