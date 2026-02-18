export interface ProctoringSession {
    id: string;
    user_id: string;
    test_id: string;
    started_at: string;
    ended_at?: string;
    violations: Violation[];
    status: 'active' | 'paused' | 'completed';
}
export interface Violation {
    id: string;
    session_id: string;
    type: 'face_not_detected' | 'multiple_faces' | 'tab_switch' | 'fullscreen_exit';
    timestamp: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
}
export interface CameraSettings {
    enabled: boolean;
    width: number;
    height: number;
    frameRate: number;
}
