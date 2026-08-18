import { Link } from 'wouter';
import { Blobs, Logo } from '@/components/Brand';

export default function NotFound() {
  return (
    <div className="screen-bg w-full flex flex-col items-center justify-center relative overflow-hidden px-6 gap-6">
      <Blobs />
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <Logo size="sm" />
        <h1 className="font-display text-5xl text-[color:var(--color-primary)]">Página perdida</h1>
        <p className="text-white/60 text-sm">Esta pantalla no existe. Volvamos al juego.</p>
        <Link
          href="/"
          className="btn-primary font-display text-2xl tracking-widest px-8 py-3 rounded-2xl"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
