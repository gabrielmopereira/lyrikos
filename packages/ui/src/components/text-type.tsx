"use client";

import { gsap } from "gsap";
import type { ElementType } from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";

const EMPTY_TEXT_COLORS: Array<string> = [];

type TextTypeProps = {
  as?: ElementType;
  className?: string;
  cursorBlinkDuration?: number;
  cursorCharacter?: string | React.ReactNode;
  cursorClassName?: string;
  deletingSpeed?: number;
  hideCursorWhileTyping?: boolean;
  initialDelay?: number;
  loop?: boolean;
  onComplete?: () => void;
  onSentenceComplete?: (sentence: string, index: number) => void;
  pauseDuration?: number;
  reverseMode?: boolean;
  showCursor?: boolean;
  startOnVisible?: boolean;
  text: string | Array<string>;
  textColors?: Array<string>;
  typingSpeed?: number;
  variableSpeed?: { max: number; min: number };
};

const TextType = ({
  as: Component = "div",
  className = "",
  cursorBlinkDuration = 0.5,
  cursorCharacter = "|",
  cursorClassName = "",
  deletingSpeed = 30,
  hideCursorWhileTyping = false,
  initialDelay = 0,
  loop = true,
  onComplete,
  onSentenceComplete,
  pauseDuration = 2000,
  reverseMode = false,
  showCursor = true,
  startOnVisible = false,
  text,
  textColors = EMPTY_TEXT_COLORS,
  typingSpeed = 50,
  variableSpeed,
  ...props
}: TextTypeProps & React.HTMLAttributes<HTMLElement>) => {
  const [displayedText, setDisplayedText] = useState("");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLElement>(null);
  const hasCompletedRef = useRef(false);

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) {
      return typingSpeed;
    }
    const { max, min } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [variableSpeed, typingSpeed]);

  const getCurrentTextColor = () => {
    if (textColors.length === 0) {
      return "inherit";
    }
    return textColors[currentTextIndex % textColors.length];
  };

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (showCursor && cursorRef.current) {
      gsap.set(cursorRef.current, { opacity: 1 });
      gsap.to(cursorRef.current, {
        duration: cursorBlinkDuration,
        ease: "power2.inOut",
        opacity: 0,
        repeat: -1,
        yoyo: true,
      });
    }
  }, [showCursor, cursorBlinkDuration]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;

    const currentText = textArray[currentTextIndex] ?? "";
    const processedText = reverseMode ? [...currentText].toReversed().join("") : currentText;

    const executeTypingAnimation = () => {
      if (isDeleting) {
        hasCompletedRef.current = false;

        if (displayedText === "") {
          setIsDeleting(false);
          if (currentTextIndex === textArray.length - 1 && !loop) {
            return;
          }

          if (onSentenceComplete) {
            onSentenceComplete(textArray[currentTextIndex], currentTextIndex);
          }

          setCurrentTextIndex((prev) => (prev + 1) % textArray.length);
          setCurrentCharIndex(0);
          timeout = setTimeout(() => {}, pauseDuration);
        } else {
          timeout = setTimeout(() => {
            setDisplayedText((prev) => prev.slice(0, -1));
          }, deletingSpeed);
        }
      } else if (currentCharIndex < processedText.length) {
        timeout = setTimeout(
          () => {
            setDisplayedText((prev) => prev + processedText[currentCharIndex]);
            setCurrentCharIndex((prev) => prev + 1);
          },
          variableSpeed ? getRandomSpeed() : typingSpeed,
        );
      } else if (textArray.length >= 1) {
        if (!loop && currentTextIndex === textArray.length - 1) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
          }

          return;
        }
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    };

    if (currentCharIndex === 0 && !isDeleting && displayedText === "") {
      timeout = setTimeout(executeTypingAnimation, initialDelay);
    } else {
      executeTypingAnimation();
    }

    return () => clearTimeout(timeout);
  }, [
    currentCharIndex,
    displayedText,
    isDeleting,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    textArray,
    currentTextIndex,
    loop,
    initialDelay,
    isVisible,
    reverseMode,
    variableSpeed,
    onComplete,
    onSentenceComplete,
    getRandomSpeed,
  ]);

  const shouldHideCursor =
    hideCursorWhileTyping &&
    (currentCharIndex < (textArray[currentTextIndex]?.length ?? 0) || isDeleting);

  return (
    <Component
      className={`inline-block tracking-tight whitespace-pre-wrap ${className}`}
      ref={containerRef}
      {...props}
    >
      <span className="inline" style={{ color: getCurrentTextColor() || "inherit" }}>
        {displayedText}
      </span>
      {showCursor && (
        <span
          className={`ml-1 inline-block opacity-100 ${shouldHideCursor ? "hidden" : ""} ${cursorClassName}`}
          ref={cursorRef}
        >
          {cursorCharacter}
        </span>
      )}
    </Component>
  );
};

export { TextType };
