interface VercelRequestLike {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (data: unknown) => void;
}

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function cleanWhitespace(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function formatDbdDateToThai(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length !== 8) return raw || '';
  const yearCe = Number(digits.slice(0, 4));
  const monthIdx = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  if (!yearCe || monthIdx < 0 || monthIdx > 11 || !day) return raw;
  return `${day} ${THAI_MONTHS[monthIdx]} ${yearCe + 543}`;
}

function inferKnownPostalCode(district: string, province: string): string {
  const d = cleanWhitespace(district);
  const p = cleanWhitespace(province);
  if (p === 'ปทุมธานี' && d === 'คลองหลวง') return '12120';
  if (p.includes('กรุงเทพ') && d === 'สวนหลวง') return '10250';
  return '';
}

function extractTaxIdFromRequest(req: VercelRequestLike): string {
  const queryTaxId = req.query?.taxId;
  if (typeof queryTaxId === 'string' && queryTaxId.trim()) {
    return queryTaxId.trim();
  }
  if (Array.isArray(queryTaxId) && queryTaxId[0]) {
    return String(queryTaxId[0]).trim();
  }
  if (req.url) {
    try {
      const u = new URL(req.url, 'https://localhost');
      return (u.searchParams.get('taxId') || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const juristicId = extractTaxIdFromRequest(req).replace(/\D/g, '');
    if (juristicId.length !== 13) {
      res.status(400).json({ ok: false, error: 'กรุณาระบุเลขทะเบียนนิติบุคคล 13 หลักให้ถูกต้อง' });
      return;
    }

    const url = `https://openapi.dbd.go.th/api/v1/juristic_person/${encodeURIComponent(juristicId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JaiklaDigitalAccounting/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      res.status(502).json({ ok: false, error: `DBD API ตอบกลับสถานะ HTTP ${response.status}` });
      return;
    }

    const json = (await response.json()) as {
      status?: { code?: string; description?: string };
      data?: Array<Record<string, unknown>>;
    };

    if (json.status?.code !== '1000' || !Array.isArray(json.data) || json.data.length === 0) {
      res.status(404).json({
        ok: false,
        error: json.status?.description || `ไม่พบข้อมูลนิติบุคคลเลขทะเบียน ${juristicId} ในระบบ DBD`,
      });
      return;
    }

    const org = (json.data[0]?.['cd:OrganizationJuristicPerson'] || {}) as Record<string, unknown>;
    const objRaw = (org['cd:OrganizationJuristicObjective'] as Record<string, unknown> | undefined)?.[
      'td:JuristicObjective'
    ];
    const primaryObj = (Array.isArray(objRaw) ? objRaw[0] : objRaw) as
      | Record<string, unknown>
      | undefined;

    const addrContainer = (org['cd:OrganizationJuristicAddress'] as Record<string, unknown> | undefined)?.[
      'cr:AddressType'
    ] as Record<string, unknown> | undefined;

    const streetLine = cleanWhitespace(String(addrContainer?.['cd:Address'] || ''));
    const subdistrict = cleanWhitespace(
      String(
        (addrContainer?.['cd:CitySubDivision'] as Record<string, unknown> | undefined)?.[
          'cr:CitySubDivisionTextTH'
        ] || ''
      )
    );
    const district = cleanWhitespace(
      String(
        (addrContainer?.['cd:City'] as Record<string, unknown> | undefined)?.['cr:CityTextTH'] || ''
      )
    );
    const province = cleanWhitespace(
      String(
        (addrContainer?.['cd:CountrySubDivision'] as Record<string, unknown> | undefined)?.[
          'cr:CountrySubDivisionTextTH'
        ] || ''
      )
    );

    const isBangkok = province.includes('กรุงเทพ');
    const subPart = subdistrict ? (isBangkok ? `แขวง${subdistrict}` : `ต.${subdistrict}`) : '';
    const distPart = district ? (isBangkok ? `เขต${district}` : `อ.${district}`) : '';
    const provPart = province ? (isBangkok ? province : `จ.${province}`) : '';
    const inferredZip = inferKnownPostalCode(district, province);

    const fullAddress = cleanWhitespace(
      [streetLine, subPart, distPart, provPart, inferredZip].filter(Boolean).join(' ')
    );

    const registerDateRaw = cleanWhitespace(String(org['cd:OrganizationJuristicRegisterDate'] || ''));

    res.status(200).json({
      ok: true,
      data: {
        juristicId: cleanWhitespace(String(org['cd:OrganizationJuristicID'] || juristicId)),
        companyNameTh: cleanWhitespace(String(org['cd:OrganizationJuristicNameTH'] || '')),
        companyNameEn: cleanWhitespace(String(org['cd:OrganizationJuristicNameEN'] || '')),
        juristicType: cleanWhitespace(String(org['cd:OrganizationJuristicType'] || '')),
        juristicStatus: cleanWhitespace(String(org['cd:OrganizationJuristicStatus'] || '')),
        registerDateRaw,
        registerDateTh: formatDbdDateToThai(registerDateRaw),
        registeredCapital: Number(org['cd:OrganizationJuristicRegisterCapital'] || 0) || 0,
        branch: cleanWhitespace(String(org['cd:OrganizationJuristicBranchName'] || 'สำนักงานใหญ่')),
        objectiveCode: cleanWhitespace(String(primaryObj?.['td:JuristicObjectiveCode'] || '')),
        objectiveTextTh: cleanWhitespace(String(primaryObj?.['td:JuristicObjectiveTextTH'] || '')),
        address: fullAddress,
        addressParts: {
          streetLine,
          subdistrict,
          district,
          province,
          isBangkok,
        },
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[api/dbd-lookup] error:', err);
    res.status(502).json({
      ok: false,
      error:
        err instanceof Error
          ? `ไม่สามารถเชื่อมต่อ DBD Open API ได้: ${err.message}`
          : 'ไม่สามารถเชื่อมต่อ DBD Open API ได้',
    });
  }
}
