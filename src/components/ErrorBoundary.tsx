import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  render() {
    if (this.state.hasError) {
      let parsedDetail: { error?: string; operationType?: string; path?: string } | null = null;
      try {
        parsedDetail = JSON.parse(this.state.errorMessage);
      } catch {
        parsedDetail = null;
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-bold m-0">ระบบตรวจพบข้อผิดพลาด</h2>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              {parsedDetail?.error
                ? `การเชื่อมต่อฐานข้อมูลถูกปฏิเสธ (${parsedDetail.operationType || 'operation'} · ${parsedDetail.path || '-'}): ${parsedDetail.error}`
                : this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
