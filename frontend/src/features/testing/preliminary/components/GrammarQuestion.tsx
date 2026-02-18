import React from 'react';
import { t } from '@shared/utils/i18n';
import { PreliminaryQuestion } from '@shared/components/PreliminaryQuestion';
interface GrammarQuestionProps {
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
const GrammarQuestion: React.FC<GrammarQuestionProps> = (props) => {
    return (<PreliminaryQuestion {...props} questionType={t('grammar')} typeColor="purple"/>);
};
export default GrammarQuestion;
