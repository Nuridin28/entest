import * as faceapi from 'face-api.js';
import { FACE_ANALYSIS_CONFIG, VIOLATION_TYPES } from './config';
import type { FaceAnalysisResult } from './types';
export class FaceAnalyzer {
    private violationHistory = { noFace: 0, multipleFaces: 0, headTurned: 0, lookingAway: 0, eyesClosed: 0 };
    private calculateEAR(_landmarks: faceapi.FaceLandmarks68): number {
        return 0.2;
    }
    private estimateHeadPose(_landmarks: faceapi.FaceLandmarks68): {
        yaw: number;
        pitch: number;
    } {
        return { yaw: 0, pitch: 0 };
    }
    public async analyze(videoEl: HTMLVideoElement): Promise<FaceAnalysisResult | null> {
        if (!videoEl || videoEl.readyState < 3)
            return null;
        const detections = await faceapi.detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({
            inputSize: FACE_ANALYSIS_CONFIG.DETECTOR_INPUT_SIZE,
            scoreThreshold: FACE_ANALYSIS_CONFIG.DETECTOR_SCORE_THRESHOLD,
        })).withFaceLandmarks();
        const result: FaceAnalysisResult = {
            violations: [],
            state: { faceDetected: false, multipleFaces: false, headTurned: false, lookingAway: false, eyesClosed: false },
            detections,
        };
        const faceDetected = detections.length > 0 && detections[0].detection.box.width > FACE_ANALYSIS_CONFIG.MIN_FACE_SIZE;
        const multipleFaces = detections.length > 1;
        result.state.faceDetected = faceDetected;
        result.state.multipleFaces = multipleFaces;
        if (!faceDetected)
            this.violationHistory.noFace++;
        else
            this.violationHistory.noFace = 0;
        if (this.violationHistory.noFace >= FACE_ANALYSIS_CONFIG.NO_FACE_THRESHOLD_FRAMES) {
            result.violations.push(VIOLATION_TYPES.NO_FACE);
        }
        if (multipleFaces)
            this.violationHistory.multipleFaces++;
        else
            this.violationHistory.multipleFaces = 0;
        if (this.violationHistory.multipleFaces >= FACE_ANALYSIS_CONFIG.VIOLATION_THRESHOLD_FRAMES) {
            result.violations.push(VIOLATION_TYPES.MULTIPLE_FACES);
            this.violationHistory.multipleFaces = 0;
        }
        if (faceDetected && detections.length > 0) {
            const landmarks = detections[0].landmarks;
            const headPose = this.estimateHeadPose(landmarks);
            const ear = this.calculateEAR(landmarks);
            const isHeadTurned = Math.abs(headPose.yaw) > FACE_ANALYSIS_CONFIG.HEAD_YAW_TURNED_THRESHOLD;
            const isLookingAway = Math.abs(headPose.yaw) > FACE_ANALYSIS_CONFIG.HEAD_YAW_AWAY_THRESHOLD ||
                Math.abs(headPose.pitch) > FACE_ANALYSIS_CONFIG.HEAD_PITCH_AWAY_THRESHOLD;
            const areEyesClosed = ear < FACE_ANALYSIS_CONFIG.EAR_CLOSED_THRESHOLD;
            result.state.headTurned = isHeadTurned;
            result.state.lookingAway = isLookingAway;
            result.state.eyesClosed = areEyesClosed;
            if (isHeadTurned) {
                this.violationHistory.headTurned++;
                if (this.violationHistory.headTurned >= FACE_ANALYSIS_CONFIG.VIOLATION_THRESHOLD_FRAMES) {
                    result.violations.push(VIOLATION_TYPES.HEAD_TURNED);
                    this.violationHistory.headTurned = 0;
                }
            }
            else {
                this.violationHistory.headTurned = 0;
            }
            if (isLookingAway) {
                this.violationHistory.lookingAway++;
                if (this.violationHistory.lookingAway >= FACE_ANALYSIS_CONFIG.VIOLATION_THRESHOLD_FRAMES) {
                    result.violations.push(VIOLATION_TYPES.LOOKING_AWAY);
                    this.violationHistory.lookingAway = 0;
                }
            }
            else {
                this.violationHistory.lookingAway = 0;
            }
            if (areEyesClosed) {
                this.violationHistory.eyesClosed++;
                if (this.violationHistory.eyesClosed >= FACE_ANALYSIS_CONFIG.VIOLATION_THRESHOLD_FRAMES) {
                    result.violations.push(VIOLATION_TYPES.EYES_CLOSED);
                    this.violationHistory.eyesClosed = 0;
                }
            }
            else {
                this.violationHistory.eyesClosed = 0;
            }
        }
        return result;
    }
}
