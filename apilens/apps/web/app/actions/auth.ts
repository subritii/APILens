'use server'

import { signIn, signOut } from '@/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'

export type AuthState = { error?: string } | undefined

export async function login(state: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) return { error: 'Email and password are required.' }

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Invalid email or password.' }
    throw e
  }
}

export async function signup(state: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) return { error: 'Email and password are required.' }
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { error: 'An account with that email already exists.' }

  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { email, password: hashed } })

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Account created but sign-in failed. Try logging in.' }
    throw e
  }
}

export async function logout() {
  await signOut({ redirectTo: '/login' })
}
