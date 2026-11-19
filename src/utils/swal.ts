import Swal from 'sweetalert2';

const baseCustomClass = {
  popup: 'jkd-swal-popup',
};

export function toastSuccess(title: string, text?: string) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    text,
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    customClass: baseCustomClass,
  });
}

export function toastError(title: string, text?: string) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title,
    text,
    showConfirmButton: false,
    timer: 3800,
    timerProgressBar: true,
    customClass: baseCustomClass,
  });
}

export async function confirmDelete(itemLabel: string): Promise<boolean> {
  const res = await Swal.fire({
    title: 'ยืนยันการลบข้อมูล?',
    html: `<span style="color:#475569;font-size:14px;">คุณต้องการลบ <strong>${itemLabel}</strong> ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    customClass: baseCustomClass,
  });
  return res.isConfirmed;
}

export async function confirmAction(
  title: string,
  text: string,
  confirmButtonText = 'ยืนยัน'
): Promise<boolean> {
  const res = await Swal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#1d4ed8',
    cancelButtonColor: '#64748b',
    confirmButtonText,
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    customClass: baseCustomClass,
  });
  return res.isConfirmed;
}

export function showUploadLoading(title = 'กำลังอัปโหลดไฟล์...') {
  Swal.fire({
    title,
    text: 'กรุณารอสักครู่ ระบบกำลังบันทึกไฟล์อย่างปลอดภัย',
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => {
      Swal.showLoading();
    },
    customClass: baseCustomClass,
  });
}

export function closeSwal() {
  Swal.close();
}
