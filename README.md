# Pedidos del Puesto

App de pedidos para tu puesto de tacos, con base de datos real (PostgreSQL)
para que los datos nunca se pierdan.

## Cómo ponerla en línea (una sola vez)

### 1. Crea la base de datos gratis en Neon
1. Ve a https://neon.tech y crea una cuenta gratis (puedes entrar con Google/GitHub).
2. Crea un proyecto nuevo (cualquier nombre, por ejemplo "pedidos-tacos").
3. En el dashboard del proyecto, busca **"Connection string"** — cópiala completa.
   Se ve algo así:
   `postgresql://usuario:contraseña@ep-algo.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Guarda ese texto, lo vas a necesitar en el paso 3.

### 2. Sube este código a GitHub
1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio nuevo (puede ser privado), por ejemplo `pedidos-tacos`.
3. Sube todos los archivos de esta carpeta a ese repositorio (puedes arrastrarlos
   directamente en la página de GitHub con "Add file" → "Upload files", no
   necesitas usar la terminal).

### 3. Despliega en Render
1. Entra a tu cuenta de Render → **New** → **Web Service**.
2. Conecta el repositorio de GitHub que acabas de crear.
3. Render debería detectar automáticamente Node.js. Configura:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Antes de crear el servicio, ve a la sección **Environment** y agrega:
   - **Key:** `DATABASE_URL`
   - **Value:** la cadena de conexión que copiaste de Neon en el paso 1
5. Dale clic a **Create Web Service**. Render va a instalar todo y arrancar
   la app — tarda 2-3 minutos la primera vez.
6. Cuando termine, Render te da una URL como
   `https://pedidos-tacos.onrender.com` — esa es tu app, ya en línea.

### 4. Primer uso
1. Abre la URL que te dio Render.
2. Toca el candado 🔒 y crea tu PIN de administrador (solo tú deberías
   hacer esto la primera vez).
3. Comparte la URL con Gaby y Mónica por WhatsApp directo.

## Notas importantes

- **El plan gratis de Render "se duerme"** después de 15 minutos sin uso.
  La primera vez que alguien abre el link después de estar dormido, tarda
  unos 20-30 segundos en despertar — es normal, no es que esté roto.
- **Los datos ya no dependen de Claude ni de "publicar" de nuevo.** Puedes
  pedirme más cambios a la app cuando quieras; solo vuelve a subir los
  archivos actualizados a GitHub y Render los despliega solo.
- **La base de datos de Neon es gratis permanentemente** (hasta cierto
  límite de uso, muy por encima de lo que un puesto de tacos necesita).
- El PIN de administrador se guarda con hash (cifrado) en la base de datos,
  no en texto plano — nadie puede leerlo directamente aunque tenga acceso
  a la base de datos.

## Estructura del proyecto

```
pedidos-app/
  server.js       -> backend (Express + PostgreSQL)
  package.json    -> dependencias
  public/
    index.html    -> toda la interfaz (HTML+CSS+JS)
  render.yaml      -> configuración opcional para desplegar por Blueprint
```
