'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  AuthFailure, consumeMagicLink, establishSession, login, loginAsDemoUser, register,
  requestMagicLink, type Intent,
} from '@/services/auth'
import { clearSessionCookie, getActor } from '@/lib/auth/session'
import { recordAudit } from '@/services/audit'
import type { Actor } from '@/lib/auth/session'

export interface AuthState {
  error?: string
  notice?: string
  magicLink?: string
  /**
   * What the person typed, echoed back so a rejected submission does not make
   * them retype the whole form. React resets an uncontrolled form once its
   * action resolves, so the values have to come back through state to survive.
   * The password is deliberately never echoed.
   */
  values?: Record<string, string>
}

function landingFor(actor: Actor): string {
  if (actor.isAdmin) return '/admin'
  if (actor.isLender) return '/lender'
  return '/dashboard'
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Enter your email and password.' }

  let destination: string
  try {
    const { actor, token } = await login(email, password)
    await establishSession(token)
    destination = landingFor(actor)
  } catch (error) {
    return { error: error instanceof AuthFailure ? error.message : 'Sign-in failed. Please try again.' }
  }
  redirect(destination)
}

export async function demoLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
  let destination: string
  try {
    const { actor, token } = await loginAsDemoUser(email)
    await establishSession(token)
    destination = landingFor(actor)
  } catch (error) {
    return { error: error instanceof AuthFailure ? error.message : 'Demo sign-in is unavailable.' }
  }
  redirect(destination)
}

export async function magicLinkAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
  if (!email) return { error: 'Enter your email address.' }
  const host = (await headers()).get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const { link } = await requestMagicLink(email, `${protocol}://${host}`)
  return {
    notice: 'If that address has an account, a sign-in link is on its way. It expires in 15 minutes.',
    magicLink: link ?? undefined,
  }
}

export async function verifyMagicLinkAction(token: string): Promise<{ error: string } | never> {
  let destination: string
  try {
    const { actor, token: session } = await consumeMagicLink(token)
    await establishSession(session)
    destination = landingFor(actor)
  } catch (error) {
    return { error: error instanceof AuthFailure ? error.message : 'That link is no longer valid.' }
  }
  redirect(destination)
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const intent = String(formData.get('intent') ?? 'find_financing') as Intent
  const values = {
    intent,
    fullName: String(formData.get('fullName') ?? ''),
    title: String(formData.get('title') ?? ''),
    companyName: String(formData.get('companyName') ?? ''),
    email: String(formData.get('email') ?? ''),
  }
  if (!['find_financing', 'provide_financing', 'manage_for_clients'].includes(intent)) {
    return { error: 'Choose what you are here to do.', values }
  }

  let destination: string
  try {
    const { actor, token } = await register({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      fullName: String(formData.get('fullName') ?? ''),
      companyName: String(formData.get('companyName') ?? ''),
      title: String(formData.get('title') ?? '') || null,
      phone: String(formData.get('phone') ?? '') || null,
      intent,
    })
    await establishSession(token)
    // A new lender lands on their lending box: it is the one thing they must
    // complete before the platform can do anything useful for them.
    destination = actor.isLender ? '/lender/box?welcome=1' : '/deals/new'
  } catch (error) {
    return {
      error: error instanceof AuthFailure ? error.message : 'Registration failed. Please try again.',
      values,
    }
  }
  redirect(destination)
}

export async function logoutAction(): Promise<never> {
  const actor = await getActor()
  if (actor) {
    await recordAudit({
      actor, action: 'auth.logout', entityType: 'user', entityId: actor.user.id,
      summary: `${actor.user.full_name} signed out.`,
    })
  }
  await clearSessionCookie()
  redirect('/login')
}
