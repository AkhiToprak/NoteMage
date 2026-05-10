-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('mc', 'true_false', 'fill_blank', 'word_bank', 'match_pairs', 'sentence_reorder', 'equation', 'translation');

-- AlterTable
ALTER TABLE "quiz_questions" ADD COLUMN     "kind" "QuestionKind" NOT NULL DEFAULT 'mc',
ADD COLUMN     "payload" JSONB;
