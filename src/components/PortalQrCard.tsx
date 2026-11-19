import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, QrCode } from 'lucide-react';
import { toastError, toastSuccess } from '../utils/swal';

export const PORTAL_PUBLIC_URL = 'https://jaikladigitalacc.jaikladigital.com/';

interface PortalQrCardProps {
  companyNameTh: string;
  companyNameEn: string;
}

export const PortalQrCard: React.FC<PortalQrCardProps> = ({
  companyNameTh,
  companyNameEn,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(PORTAL_PUBLIC_URL, {
      width: 440,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // Fallback handled silently
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDownloadQrPng = async () => {
    setDownloading(true);
    try {
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, PORTAL_PUBLIC_URL, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });

      const cardWidth = 480;
      const cardHeight = 560;
      const out = document.createElement('canvas');
      out.width = cardWidth;
      out.height = cardHeight;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // White card background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // Subtle outer frame border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, cardWidth - 24, cardHeight - 24);

      // Header text
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 21px "Anuphan", "IBM Plex Sans Thai", "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(companyNameTh || 'บริษัท ใจกล้า ดิจิตอล จำกัด', cardWidth / 2, 54);

      ctx.fillStyle = '#475569';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(companyNameEn || 'JAIKLA DIGITAL CO., LTD.', cardWidth / 2, 78);

      // Draw crisp QR code centered
      const qrX = (cardWidth - qrCanvas.width) / 2;
      const qrY = 96;
      ctx.drawImage(qrCanvas, qrX, qrY);

      // Caption & URL footer
      ctx.fillStyle = '#0f766e';
      ctx.font = 'bold 16px "Anuphan", "IBM Plex Sans Thai", "Noto Sans Thai", sans-serif';
      ctx.fillText('สแกนเพื่อเข้าใช้งานระบบ / แจ้งเบิกค่าใช้จ่ายโครงการ', cardWidth / 2, 492);

      ctx.fillStyle = '#334155';
      ctx.font = '600 14px "IBM Plex Mono", monospace';
      ctx.fillText('jaikladigitalacc.jaikladigital.com', cardWidth / 2, 520);

      const pngUrl = out.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = 'jaikla-portal-qr.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toastSuccess(
        'บันทึกภาพ QR Code เรียบร้อยแล้ว',
        'สามารถนำไฟล์ jaikla-portal-qr.png ส่งต่อในแอป LINE ให้ทีมงานสแกนเข้าใช้งานได้ทันที'
      );
    } catch {
      toastError('ไม่สามารถสร้างไฟล์ QR Code ได้');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(PORTAL_PUBLIC_URL);
      toastSuccess('คัดลอกลิงก์เข้าระบบเรียบร้อยแล้ว', PORTAL_PUBLIC_URL);
    } catch {
      toastError('ไม่สามารถคัดลอกลิงก์ได้');
    }
  };

  return (
    <div className="mt-3 p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center gap-3 text-left">
      <div className="w-[86px] h-[86px] shrink-0 rounded-lg border border-slate-200 bg-white p-1 flex items-center justify-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR Code เข้าใช้งานระบบ บริษัท ใจกล้า ดิจิตอล จำกัด"
            className="w-full h-full object-contain"
          />
        ) : (
          <QrCode className="w-8 h-8 text-slate-400" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs font-bold text-slate-900 leading-tight">
          QR Code ทางลัดเข้าใช้งานระบบ
        </div>
        <div className="text-[11px] font-mono-num text-teal-800 truncate leading-tight">
          {PORTAL_PUBLIC_URL}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            type="button"
            disabled={!qrDataUrl || downloading}
            onClick={handleDownloadQrPng}
            className="inline-flex items-center gap-1 px-2.5 py-1 !rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-[11px] font-semibold whitespace-nowrap cursor-pointer border-0"
          >
            <Download className="w-3 h-3 shrink-0" />
            <span>{downloading ? 'กำลังสร้าง...' : 'บันทึกภาพ QR ส่ง LINE'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1 px-2 py-1 !rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold whitespace-nowrap cursor-pointer"
          >
            <Copy className="w-3 h-3 shrink-0" />
            <span>คัดลอกลิงก์</span>
          </button>
        </div>
      </div>
    </div>
  );
};
