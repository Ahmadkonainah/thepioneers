import { CaseFile } from "@/components/case-file";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-8">
      <CaseFile />
      <footer className="mt-10 border-t border-foreground/15 py-6 text-sm text-muted-foreground">
        Synthetic demo data. The people and documents are fictional. No customer data is stored. The session
        cookie is essential and is not used for tracking. Voice, if you use it, is sent to the speech provider for
        that request only and is not kept. A ruling is filed only after a person clicks Sign ruling.
      </footer>
    </main>
  );
}
