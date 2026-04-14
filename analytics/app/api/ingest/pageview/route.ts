import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey, checkIngestRateLimit, getClientIp } from '@/lib/ingest';
import { checkBot, computeVisitorHash, computeDeviceHash, categorizeReferrer, isSpamReferrer } from '@/lib/quality';

// ua-parser-js v2 — types are complex, use any for constructor
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const UAParser = require('ua-parser-js') as any;

export const runtime = 'nodejs';

const signalsSchema = z.object({
  screen: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    pixelRatio: z.number().optional(),
    colorDepth: z.number().optional(),
  }).optional(),
  viewport: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
  lang: z.string().max(20).nullable().optional(),
  tz: z.string().max(60).nullable().optional(),
  tzOffset: z.number().optional(),
  connection: z.object({
    type: z.string().nullable().optional(),
    effectiveType: z.string().nullable().optional(),
    saveData: z.boolean().optional(),
  }).nullable().optional(),
  webdriver: z.boolean().optional(),
  plugins: z.number().optional(),
  hardwareConcurrency: z.number().optional(),
  maxTouchPoints: z.number().optional(),
}).optional();

const schema = z.object({
  path: z.string().min(1).max(500),
  referrer: z.string().max(500).optional().nullable(),
  sessionId: z.string().max(100).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmTerm: z.string().max(100).optional().nullable(),
  utmContent: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  signals: signalsSchema,
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const siteKey = req.headers.get('x-site-key') ?? '';
  const rateLimited = checkIngestRateLimit(siteKey, req);
  if (rateLimited) return rateLimited;

  const site = await resolveSiteKey(req);
  if (!site) {
    return NextResponse.json(
      { error: 'invalid_site_key' },
      { status: 401, headers: corsHeaders() },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: corsHeaders() },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() },
    );
  }

  const d = parsed.data;
  const rawUA = req.headers.get('user-agent')?.slice(0, 500) ?? '';
  const signals = d.signals ?? {};

  // Parse UA
  const parser = new UAParser(rawUA);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  const deviceType = device.type === 'mobile' ? 'mobile'
    : device.type === 'tablet' ? 'tablet'
    : 'desktop';

  // Geo from Cloudflare headers
  const country = req.headers.get('cf-ipcountry') ?? null;
  const city = req.headers.get('cf-ipcity') ?? null;
  const region = req.headers.get('cf-region-code') ?? null;
  const postalCode = req.headers.get('cf-postal-code') ?? null;
  const latitude = parseFloat(req.headers.get('cf-latitude') ?? '') || null;
  const longitude = parseFloat(req.headers.get('cf-longitude') ?? '') || null;
  const continent = req.headers.get('cf-ipcontinent') ?? null;
  const asnStr = req.headers.get('cf-asn') ?? req.headers.get('cf-connecting-ip-asn');
  const asn = asnStr ? parseInt(asnStr, 10) || null : null;
  const asnOrg = req.headers.get('cf-asn-organization') ?? null;

  const EU_COUNTRIES = new Set([
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
    'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  ]);
  const isEuCountry = country ? EU_COUNTRIES.has(country.toUpperCase()) : false;

  // Visitor hash
  const ip = getClientIp(req);
  const visitorHash = computeVisitorHash(site.siteId, ip, rawUA);
  const deviceHash = computeDeviceHash(
    rawUA,
    signals.screen?.width,
    signals.screen?.height,
    signals.screen?.pixelRatio,
    signals.lang,
    signals.tz,
  );

  // Spam referrer check — drop silently
  if (isSpamReferrer(d.referrer ?? null)) {
    return NextResponse.json({ ok: true, id: 'dropped', isBot: true }, { headers: corsHeaders() });
  }

  // Referrer categorization
  const { domain: referrerDomain, category: referrerCategory } = categorizeReferrer(d.referrer ?? null);

  // Bot check — simple binaire
  const bot = checkBot({
    userAgent: rawUA,
    webdriver: signals.webdriver,
    viewportWidth: signals.viewport?.width,
    screenWidth: signals.screen?.width,
    pluginsCount: signals.plugins,
    hardwareConcurrency: signals.hardwareConcurrency,
    maxTouchPoints: signals.maxTouchPoints,
    devicePixelRatio: signals.screen?.pixelRatio,
    deviceType,
  });

  const pageview = await prisma.pageview.create({
    data: {
      siteId: site.siteId,
      path: d.path,
      sessionId: d.sessionId ?? null,
      visitorHash,
      ip: ip !== 'unknown' ? ip : null,
      deviceHash,
      // Trafic source
      referrer: d.referrer ?? null,
      referrerDomain,
      referrerCategory,
      utmSource: d.utmSource ?? null,
      utmMedium: d.utmMedium ?? null,
      utmCampaign: d.utmCampaign ?? null,
      utmTerm: d.utmTerm ?? null,
      utmContent: d.utmContent ?? null,
      gclid: d.gclid ?? null,
      fbclid: d.fbclid ?? null,
      // Browser / OS / Device
      browserName: browser.name ?? null,
      browserVersion: browser.version ?? null,
      osName: os.name ?? null,
      osVersion: os.version ?? null,
      deviceType,
      deviceVendor: device.vendor ?? null,
      deviceModel: device.model ?? null,
      isMobile: deviceType === 'mobile',
      isTablet: deviceType === 'tablet',
      isDesktop: deviceType === 'desktop',
      // Screen / Viewport
      screenWidth: signals.screen?.width ?? null,
      screenHeight: signals.screen?.height ?? null,
      viewportWidth: signals.viewport?.width ?? null,
      viewportHeight: signals.viewport?.height ?? null,
      devicePixelRatio: signals.screen?.pixelRatio ?? null,
      colorDepth: signals.screen?.colorDepth ?? null,
      // Locale
      language: signals.lang ?? null,
      timezone: signals.tz ?? null,
      timezoneOffset: signals.tzOffset ?? null,
      // Network
      connectionType: signals.connection?.type ?? null,
      effectiveType: signals.connection?.effectiveType ?? null,
      saveData: signals.connection?.saveData ?? null,
      // Geo
      country,
      region,
      city,
      postalCode,
      latitude,
      longitude,
      continent,
      asn,
      asnOrg,
      isEuCountry,
      // Bot / interaction — 2 booléens, c'est tout
      isBot: bot.isBot,
      interacted: false, // mis à true par /api/ingest/interaction
      botFlags: bot.flags,
    },
    select: { id: true, isBot: true },
  });

  return NextResponse.json(
    { ok: true, id: pageview.id, isBot: pageview.isBot },
    { headers: corsHeaders() },
  );
}
