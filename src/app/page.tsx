import { DocumentationGenerator } from "@/components/DocumentationGenerator";
import { Logo } from "@/components/icons";

export default function Home() {
  return (
    <main className="min-h-screen container mx-auto px-4 py-8 md:py-16">
      <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
        <Logo className="w-16 h-16 mb-4 text-primary" />
        <h1 className="font-headline text-4xl md:text-6xl font-bold tracking-tighter">
          RepoDocs
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl">
          Instantly generate comprehensive technical documentation for any GitHub repository. Just paste a URL below to get started.
        </p>
      </div>

      <div className="mt-12 max-w-4xl mx-auto">
        <DocumentationGenerator />
      </div>

      <footer className="text-center mt-16 text-muted-foreground text-sm">
        <p>Powered by Google Cloud and Next.js</p>
      </footer>
    </main>
  );
}
