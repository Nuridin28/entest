import React from 'react';
import { t } from '@shared/utils/i18n';
import { PreliminaryQuestion } from '@shared/components/PreliminaryQuestion';
interface VocabularyQuestionProps {
    question: {
        question: string;
        options: Record<string, string>;
    };
    userAnswer: string;
    onSubmit: (answer: string) => void;
    currentQuestionIndex?: number;
    totalQuestions?: number;
    onPrevious?: () => void;
    onNext?: () => void;
    canGoNext?: boolean;
}
const VocabularyQuestion: React.FC<VocabularyQuestionProps> = (props) => {
    return (<PreliminaryQuestion {...props} questionType={t('vocabulary')} typeColor="purple"/>);
};
export default VocabularyQuestion;
