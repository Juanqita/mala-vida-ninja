import { motion } from 'framer-motion';

const logo = `${import.meta.env.BASE_URL}logo.png`;

export function Blobs() {
  return (
    <>
      <div
        className="blob"
        style={{ top: 0, left: 0, width: 260, height: 260, background: '#F5C518', opacity: 0.2, transform: 'translate(-30%, -30%)' }}
      />
      <div
        className="blob"
        style={{ bottom: 0, right: 0, width: 320, height: 320, background: '#7C3AED', opacity: 0.15, transform: 'translate(30%, 30%)' }}
      />
    </>
  );
}

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const px = size === 'lg' ? 144 : 80;
  return (
    <motion.div
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45 }}
      className="flex flex-col items-center"
    >
      <img
        src={logo}
        alt="Mala Vida Fast Food"
        width={px}
        height={px}
        className="object-contain drop-shadow-2xl"
        style={{ width: px, height: px }}
      />
      {size === 'lg' && (
        <>
          <h1 className="font-display text-5xl tracking-[0.15em] text-white mt-1 text-center leading-none text-glow">
            MALA VIDA
          </h1>
          <p className="text-[color:var(--color-primary)] font-bold text-sm tracking-[0.3em] uppercase mt-1">
            Fast Food
          </p>
        </>
      )}
    </motion.div>
  );
}
