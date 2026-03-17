<?php

namespace App\Enums;

enum OutputStyle: string
{
    case WhisperOnly = 'whisper_only';
    case Verbatim = 'verbatim';
    case ElegantProse = 'elegant_prose';
    case Normal = 'normal';
    case Verbose = 'verbose';
    case Concise = 'concise';
    case Formal = 'formal';
    case BulletPoints = 'bullet_points';
    case Summary = 'summary';
    case TechDocs = 'tech_docs';
    case Email = 'email';
    case Custom = 'custom';
}
