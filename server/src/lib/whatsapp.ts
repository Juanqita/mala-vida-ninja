import { env } from '../env.js';

export function whatsappUrl(message: string, number: string = env.WHATSAPP_NUMBER): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
