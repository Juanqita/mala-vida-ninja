# Desplegar Mala Vida Fast Food

Tres caminos. El primero es el que recomiendo para arrancar: un solo servicio,
una sola URL, sin CORS que configurar.

---

## 0. Antes de nada: subir el código a GitHub

```bash
cd mala-vida
git init
git add .
git commit -m "Mala Vida Fast Food"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/mala-vida.git
git push -u origin main
```

`.env` está en `.gitignore`: las claves nunca se suben.

---

## 1. Render (recomendado) — todo en un servicio

**Opción rápida (blueprint):** en Render, *New → Blueprint*, conecta el repo y
acepta. `render.yaml` crea la base de datos y el servicio web. Solo tendrás que
escribir a mano `ADMIN_KEY`.

**Opción manual:**

1. *New → PostgreSQL*. Plan free. Copia el **Internal Database URL**.
2. *New → Web Service*, conecta el repo:
   - Build command: `npm install --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`

   > El `--include=dev` no es opcional: como `NODE_ENV=production` está entre
   > las variables, npm se salta las devDependencies y ahí viven `vite`,
   > `esbuild` y `typescript`. Sin eso el build muere con `vite: not found`.
3. Environment:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | el Internal Database URL del paso 1 |
| `DATABASE_SSL` | `true` (`false` si usas el *Internal* URL de Render) |
| `SESSION_SECRET` | algo largo y aleatorio |
| `ADMIN_KEY` | la clave del panel admin |
| `WHATSAPP_NUMBER` | `573134966423` |
| `TIMEZONE` | `America/Bogota` |
| `NODE_ENV` | `production` |

Las migraciones y la carga del catálogo de premios corren solas al arrancar.

Listo: el juego queda en `https://tu-servicio.onrender.com` y el panel en
`https://tu-servicio.onrender.com/admin`.

> **Ojo con el plan free de Render:** el servicio se duerme tras 15 minutos sin
> tráfico y la primera visita después tarda ~30 segundos en responder. Para una
> campaña con clientes reales vale la pena el plan pago más barato, o mantenerlo
> despierto con un ping cada 10 minutos.

---

## 2. Railway — igual de simple

1. *New Project → Deploy from GitHub repo*.
2. *New → Database → PostgreSQL*. Railway inyecta `DATABASE_URL` solo.
3. En el servicio, Variables: `SESSION_SECRET`, `ADMIN_KEY`, `WHATSAPP_NUMBER`,
   `TIMEZONE=America/Bogota`, `NODE_ENV=production`, `DATABASE_SSL=false`.
4. Settings → Build command `npm install --include=dev && npm run build`,
   Start `npm start`.
5. Settings → Networking → *Generate Domain*.

---

## 3. GitHub Pages (juego) + Render/Railway (backend)

Sirve si quieres el juego en un dominio estático y gratis. El backend igual
tiene que estar en algún lado, porque hay base de datos.

1. Despliega el backend con el paso 1 o 2 y anota su URL.
2. En el repo: *Settings → Pages → Source: GitHub Actions*.
3. *Settings → Secrets and variables → Actions → New repository secret*:
   `VITE_API_URL` = `https://tu-backend.onrender.com`
4. En el backend, pon `CORS_ORIGIN` = `https://TU-USUARIO.github.io`
   (así solo tu sitio puede llamar a la API).
5. Haz push a `main`. El workflow `deploy-pages.yml` compila y publica.

El juego queda en `https://TU-USUARIO.github.io/mala-vida/` y el panel admin
sigue viviendo en el backend: `https://tu-backend.onrender.com/admin`.

---

## El link que vas a compartir

De peor a mejor, según cuánto quieras invertir:

**a) Renombrar el servicio (gratis, 1 minuto).** Render arma la URL con el
nombre del servicio: si lo llamas `malavida`, queda
`https://malavida.onrender.com`. Settings → Name. Ojo: cambia la URL, así que
hazlo antes de repartir el link.

**b) Acortador (gratis).** `bit.ly/malavida-juego` o, mejor, `dub.co` que
permite links con tu propio dominio. Sirve para WhatsApp, pero el link no dice
nada de la marca y no puedes cambiarle el destino si el acortador cierra.

**c) Dominio propio (~US$10–15 al año, lo que yo haría).** Compras
`malavida.co` o `juegamalavida.com` en Porkbun o Namecheap, y en Render:
Settings → Custom Domains → *Add* → escribes `juega.malavida.co`. Render te da
un CNAME que pegas en el panel del dominio, y el certificado HTTPS lo emite
solo. Queda `https://juega.malavida.co` — corto, tuyo, y si algún día cambias
de servidor el link sigue siendo el mismo.

Si ya tienen dominio del restaurante, el paso (c) es gratis: basta con crear el
subdominio `juega.` apuntando a Render.

### Que el link se vea bonito en WhatsApp

Cuando pegas la URL en un chat, WhatsApp muestra título, descripción y una
imagen. Esa imagen tiene que ir con dirección absoluta, así que se define al
compilar:

```
VITE_PUBLIC_URL=https://juega.malavida.co
```

Agrégala en las variables de entorno de Render (o Railway) junto a las demás.
Sin ella el juego funciona igual, pero la vista previa sale sin logo.

Para verificar cómo se ve antes de repartirlo, pega la URL en
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) —
WhatsApp usa la misma vista previa y ahí puedes forzar que la refresque.

### En el local, lo que manda es el QR

Nadie escribe una URL desde una mesa. Genera un QR de tu link y ponlo en las
mesas, en la caja y en las cajas de domicilio. Cualquier generador sirve; si el
link es corto, el QR sale menos denso y escanea más rápido incluso impreso
pequeño.

---

## Base de datos gratis (si no usas la del proveedor)

- **Neon** (neon.tech): plan free, no se duerme. `DATABASE_SSL=true`.
- **Supabase**: usa la *Connection string* modo *Session*. `DATABASE_SSL=true`.

---

## Después de desplegar, revisa esto

```bash
curl https://tu-servicio.onrender.com/api/health
# {"ok":true,"today":"2026-08-18","timezone":"America/Bogota",...}
```

- [ ] `today` coincide con la fecha real en Colombia.
- [ ] Abres el juego, entras con tu número y puedes jugar.
- [ ] Al terminar te sale un premio con código.
- [ ] Vuelves a entrar con el mismo número → "Ya jugaste hoy".
- [ ] En `/admin` con tu `ADMIN_KEY`: buscas tu número, ves el premio y lo
      marcas entregado; al intentarlo dos veces te dice que ya fue entregado.
- [ ] En Ajustes, el stock del día muestra 1 hamburguesa, 2 bebidas,
      3 domicilios y 5 cupones de 30%.

---

## Operación diaria en el local

1. El cliente muestra el mensaje de WhatsApp o dice su código (`MV-XXXXXX`).
2. En `/admin` → **Verificar**, pegas el código o el número.
3. Confirmas que dice **Pendiente** y tocas **Marcar entregado**.
4. Si el cliente insiste con un código ya usado, el panel lo dice con la hora
   exacta en que se entregó.

El CSV de la pestaña Premios sirve para cuadrar cuántos premios se entregaron
en el día.

---

## Copia de seguridad

```bash
pg_dump "$DATABASE_URL" > respaldo-$(date +%F).sql
```

Vale la pena hacerlo al menos una vez por semana mientras la campaña esté viva.
