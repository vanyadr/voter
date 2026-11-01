import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  LockKeyhole,
  Sparkles,
  Users,
  Trophy,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { configurationProblems, identity } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const who = await identity();
  if (who) redirect("memberId" in who ? "/dashboard" : "/setup");
  const problems = configurationProblems();
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="story-body">
          <span className="eyebrow">
            <span className="live-dot" /> КЕЙС-ЧЕМПИОНАТ
          </span>
          <h1>
            Хорошие идеи
            <br />
            заслуживают
            <br />
            <span>честной оценки.</span>
          </h1>
          <p>
            Смотрите выступления, отмечайте сильные стороны и помогайте выбрать
            лучшее решение.
          </p>
          <div className="story-stats">
            <div>
              <Users size={20} />
              <strong>4</strong>
              <span>участника</span>
            </div>
            <div>
              <Sparkles size={20} />
              <strong>6</strong>
              <span>критериев</span>
            </div>
            <div>
              <Trophy size={20} />
              <strong>1</strong>
              <span>победитель</span>
            </div>
          </div>
        </div>
        <div className="story-bottom">
          <span>Идеи. Решения. Люди.</span>
          <ArrowUpRight size={20} />
        </div>
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
      </section>
      <section className="login-entry">
        <div className="login-card">
          <div className="section-icon">
            <LockKeyhole size={25} />
          </div>
          <span className="eyebrow muted">ВАШЕ МНЕНИЕ ИМЕЕТ ЗНАЧЕНИЕ</span>
          <h2>Добро пожаловать</h2>
          <p className="subtitle">
            Введите личный код, чтобы перейти
            <br className="desktop-break" /> к оценке выступлений.
          </p>
          <LoginForm
            enabled={problems.length === 0}
            configurationProblems={problems}
          />
          <div className="privacy-note">
            <span>
              <Check size={14} />
            </span>
            <p>
              Ваши оценки анонимны для других.
              <br />
              Результаты доступны только жюри.
            </p>
          </div>
        </div>
        <footer>
          Маленькое приложение для больших идей <span>✦</span>
        </footer>
      </section>
    </main>
  );
}
