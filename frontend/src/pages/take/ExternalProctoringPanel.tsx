import { type RefObject, useEffect } from 'react';
import { type ExternalProctoringState } from './useExternalProctoring';

interface Props {
    procState: ExternalProctoringState;
    cameraStream: MediaStream | null;
    videoRef: RefObject<HTMLVideoElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
}

export const ExternalProctoringPanel = ({ procState, cameraStream, videoRef, canvasRef }: Props) => {
    // Attach stream to video when panel mounts or stream changes
    useEffect(() => {
        if (!cameraStream || !videoRef.current) return;
        if (videoRef.current.srcObject !== cameraStream) {
            videoRef.current.srcObject = cameraStream;
            videoRef.current.play().catch(() => {});
        }
    }, [cameraStream, videoRef]);

    const { faceDetected, multipleFaces, headTurned, lookingAway, eyesClosed,
            violationCount, cameraEnabled } = procState;

    const riskLevel = violationCount === 0 ? 'ok'
        : violationCount <= 2 ? 'warn'
        : 'danger';

    const riskColors = {
        ok:     { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700',  dot: 'bg-emerald-500',  label: 'Нет нарушений' },
        warn:   { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',    dot: 'bg-amber-500',    label: 'Есть нарушения' },
        danger: { bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700',      dot: 'bg-red-500 animate-pulse', label: 'Критично' },
    }[riskLevel];

    const faceColor = !cameraEnabled ? 'text-gray-400'
        : faceDetected ? 'text-emerald-600'
        : 'text-red-500';

    const hints = [
        headTurned   && { icon: '↩', label: 'Голова повёрнута',    color: 'text-amber-600' },
        lookingAway  && { icon: '👀', label: 'Взгляд в сторону',   color: 'text-amber-600' },
        eyesClosed   && { icon: '😴', label: 'Глаза закрыты',       color: 'text-red-500'   },
        multipleFaces && { icon: '👥', label: 'Несколько лиц',      color: 'text-red-500'   },
    ].filter(Boolean) as { icon: string; label: string; color: string }[];

    return (
        <aside className="fixed top-4 right-4 w-56 flex flex-col gap-3 z-40">

            {/* Camera */}
            <div className="rounded-2xl overflow-hidden bg-gray-900 shadow-lg ring-1 ring-white/10">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-800">
                    <span className={`w-2 h-2 rounded-full ${cameraEnabled ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                    <span className="text-[11px] text-gray-300 font-medium tracking-wide">Камера</span>
                    <span className={`ml-auto text-[10px] font-semibold ${faceColor}`}>
                        {!cameraEnabled ? '—' : faceDetected ? '✓ Лицо' : '✗ Лицо'}
                    </span>
                </div>
                <div className="relative aspect-[4/3] bg-gray-900">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                    {!cameraEnabled && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                            Нет камеры
                        </div>
                    )}
                </div>
            </div>

            {/* Violation counter */}
            <div className={`rounded-2xl border px-4 py-3 ${riskColors.bg} ${riskColors.border} shadow-sm`}>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Нарушения</span>
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${riskColors.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${riskColors.dot}`} />
                        {riskColors.label}
                    </span>
                </div>
                <div className={`text-3xl font-bold ${riskColors.text}`}>{violationCount}</div>
            </div>

            {/* Behaviour hints */}
            {hints.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 shadow-sm space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1">Замечания</div>
                    {hints.map((h, i) => (
                        <div key={i} className={`flex items-center gap-2 text-[12px] font-medium ${h.color}`}>
                            <span>{h.icon}</span>
                            <span>{h.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Recording indicator */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 border border-gray-200">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-[11px] text-gray-500 font-medium">Запись экрана идёт</span>
            </div>

        </aside>
    );
};
