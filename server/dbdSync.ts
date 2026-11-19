export interface DbdCompanyLookupResult {
  juristicId: string;
  companyNameTh: string;
  companyNameEn: string;
  juristicType: string;
  juristicStatus: string;
  registerDateRaw: string;
  registerDateTh: string;
  registeredCapital: number;
  branch: string;
  objectiveCode: string;
  objectiveTextTh: string;
  address: string;
  addressParts: {
    streetLine: string;
    subdistrict: string;
    district: string;
    province: string;
    isBangkok: boolean;
  };
  fetchedAt: string;
}

export class DbdLookupError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'DbdLookupError';
    this.status = status;
  }
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

function formatDbdDateToThai(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length !== 8) return raw || '';
  const yearCe = Number(digits.slice(0, 4));
  const monthIdx = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  if (!yearCe || monthIdx < 0 || monthIdx > 11 || !day) return raw;
  return `${day} ${THAI_MONTHS[monthIdx]} ${yearCe + 543}`;
}

function cleanWhitespace(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function inferKnownPostalCode(district: string, province: string): string {
  const d = cleanWhitespace(district);
  const p = cleanWhitespace(province);
  if (p === 'ปทุมธานี' && d === 'คลองหลวง') return '12120';
  if (p.includes('กรุงเทพ') && d === 'สวนหลวง') return '10250';
  return '';
}

export async function fetchCompanyFromDbd(rawTaxId: string): Promise<DbdCompanyLookupResult> {
  const juristicId = (rawTaxId || '').replace(/\D/g, '');
  if (juristicId.length !== 13) {
    throw new DbdLookupError('กรุณาระบุเลขทะเบียนนิติบุคคล 13 หลักให้ถูกต้อง', 400);
  }

  const url = `https://openapi.dbd.go.th/api/v1/juristic_person/${encodeURIComponent(juristicId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JaiklaDigitalAccounting/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch (err) {
    throw new DbdLookupError(
      err instanceof Error
        ? `ไม่สามารถเชื่อมต่อ DBD Open API ได้: ${err.message}`
        : 'ไม่สามารถเชื่อมต่อ DBD Open API ได้',
      502
    );
  }

  if (!response.ok) {
    throw new DbdLookupError(`DBD API ตอบกลับสถานะ HTTP ${response.status}`, 502);
  }

  const json = (await response.json()) as {
    status?: { code?: string; description?: string };
    data?: Array<Record<string, unknown>>;
  };

  if (json.status?.code !== '1000' || !Array.isArray(json.data) || json.data.length === 0) {
    throw new DbdLookupError(
      json.status?.description || `ไม่พบข้อมูลนิติบุคคลเลขทะเบียน ${juristicId} ในระบบ DBD`,
      404
    );
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

  return {
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
  };
}
