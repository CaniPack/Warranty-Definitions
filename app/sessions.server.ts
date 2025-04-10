import { createCookieSessionStorage } from "@remix-run/node";
import * as dotenv from "dotenv";
dotenv.config();

// Log para ver el valor EXACTO que tiene process.env.SESSION_SECRET en este punto
console.log('🚨 SPARK SESSIONS DEBUG 🚨 Valor de process.env.SESSION_SECRET:', process.env.SESSION_SECRET);

// Asegúrate de que SESSION_SECRET esté en tu archivo .env
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in your environment variables");
}

// Exportamos las funciones para obtener/confirmar la sesión de Remix
export const { getSession, commitSession, destroySession } = 
  createCookieSessionStorage({
    cookie: {
      name: "__session", // Nombre de la cookie
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 1 semana (ajusta según necesites)
      path: "/",
      sameSite: "lax",
      secrets: [process.env.SESSION_SECRET],
      secure: process.env.NODE_ENV === "production", // True en producción
    },
  }); 