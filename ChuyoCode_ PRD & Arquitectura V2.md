# **ChuyoCode: PRD & Arquitectura V2**

## **Plataforma Educativa Tecnológica Latina**

Modelo: Value Exchange (Premium Pass)  
Stack: Astro \+ Headless CMS  
Fecha: Julio 2026

## **1\. Visión e Identidad del Producto**

**ChuyoCode** es una plataforma de contenido educativo tecnológico con fuerte identidad latina y peruana. Combina una interfaz moderna (estilo plataforma de streaming) con un modelo de monetización no intrusivo: los usuarios acceden al contenido premium y sin bloqueos mediante la visualización voluntaria de anuncios recompensados, obteniendo pases de acceso de 24 horas.

## **2\. Stack Tecnológico Actualizado (Enfoque Rendimiento)**

El stack ha sido optimizado priorizando la velocidad de carga (SEO) y la experiencia del desarrollador, utilizando Astro como núcleo.

| Capa | Tecnología Recomendada | Justificación |
| :---- | :---- | :---- |
| **Frontend (Core)** | Astro (Modo Server \- SSR) | Entrega HTML puro ultrarrápido ideal para contenido (libros/noticias). Su modo SSR permite verificar en el servidor si el usuario tiene un "Pase 24h" activo antes de enviar el contenido. |
| **Interactividad (Islas)** | React o Preact (sobre Astro) | Astro cargará JavaScript solo para los componentes que lo necesiten (ej. el Modal de Anuncios o el Navbar interactivo), reduciendo drásticamente el peso de la página. |
| **Gestión de Contenido** | Sanity.io (Headless CMS) | Almacena todos los artículos, portadas y PDFs. Astro se conectará a la API de Sanity para construir las páginas dinámicamente. Permite edición ágil sin tocar código. |
| **Backend / Auth** | Supabase | Manejo de la base de datos de usuarios y el control del tiempo restante de los pases de 24 horas. |
| **Estilos** | Tailwind CSS | Gestión de diseño fluido, soporte nativo de modo oscuro (Dark Mode fluido sin saltos de color) y diseño responsivo. |

## **3\. Arquitectura del Sistema: Flujo de Datos**

**El flujo de Astro \+ CMS:** Cuando un usuario solicita una noticia, el servidor de Astro consulta a Sanity vía API, obtiene el JSON de la noticia, inyecta los datos en los componentes HTML y envía la página final al navegador.

1. **Carga de Contenido:** El administrador crea una publicación en Sanity.io.  
2. **Petición:** El usuario visita chuyocode.com/libros/python-basico.  
3. **Verificación (SSR):** Astro en el servidor consulta a Supabase si el usuario activo tiene un timestamp de caducidad válido en su pase de 24h.  
4. **Respuesta:** Si es válido, Astro sirve la página con el PDF. Si no, Astro sirve la página oscurecida con la Isla interactiva (React) que muestra el Modal del Anuncio.

## **4\. Estructura de Carpetas (Astro)**

Esta estructura organiza el proyecto separando el contenido estático de las islas interactivas y la configuración de idiomas.  
chuyocode-web/  
├── src/  
│   ├── components/             \# Componentes Astro y de UI  
│   │   ├── islands/            \# Componentes React interactivos (Modal Ads)  
│   │   ├── layout/             \# Header.astro, Footer.astro  
│   │   └── ui/                 \# Botones, Cards, Carruseles en Astro  
│   ├── layouts/                \# BaseLayout.astro (Manejo de Dark Mode global)  
│   ├── lib/                    \# Utilidades y conexiones  
│   │   ├── sanity.ts           \# Cliente para consumir la API del CMS  
│   │   └── supabase.ts         \# Cliente para Auth y BD de usuarios  
│   └── pages/                  \# Sistema de rutas basado en archivos  
│       ├── \[lang\]/             \# Rutas dinámicas para multi-idioma (es, en)  
│       │   ├── index.astro     \# Home page  
│       │   ├── libros/           
│       │   │   ├── index.astro \# Catálogo de libros  
│       │   │   └── \[slug\].astro\# Página individual de un libro (SSR)  
│       │   └── noticias/  
│       │       └── \[...page\].astro \# Paginación de noticias  
│       └── api/                \# Endpoints (ej. validar-anuncio.ts)  
├── public/                     \# Assets estáticos (imágenes, favicons)  
├── astro.config.mjs            \# Configuración de Astro (integración React/Tailwind)  
└── tailwind.config.cjs         \# Paleta de colores (Navy, Orange) y utilidades

## **5\. Experiencia de Usuario y Diseño (UI/UX)**

* **Identidad Visual:** "ChuyoCode" evoca calidez andina e identidad. La paleta de colores debe alejarse del clásico "modo oscuro aburrido". Se sugiere un fondo base gris muy oscuro (Zinc-950), textos claros y detalles de contraste alto en naranjas o rojos tierra (referencia al chullo/cultura).  
* **Dark Mode Fluido:** El botón de cambio de tema aplicará clases de Tailwind (ej. dark:bg-zinc-950). Las transiciones CSS suaves evitarán el impacto visual agresivo al cambiar de claro a oscuro.  
* **Internacionalización Nivel Astro:** Las rutas bajo la carpeta \[lang\] permitirán servir contenido específico. Astro detectará la región (ej. si entra desde Perú, cargará contenido localizado).