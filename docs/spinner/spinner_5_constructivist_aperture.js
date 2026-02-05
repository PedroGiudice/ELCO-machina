p.setup = () => {
  p.createCanvas(400, 400);
  p.colorMode(p.HSB, 360, 100, 100, 1);
  p.noStroke();
  p.rectMode(p.CENTER);
};

p.draw = () => {
  p.clear();
  p.translate(p.width / 2, p.height / 2);

  // --- TIMING & RHYTHM ---
  // A 3-second cycle broken into mechanical phases
  let totalDuration = 2500;
  let t = p.millis() % totalDuration;
  let progress = t / totalDuration;

  // Create a multi-stage easing envelope
  // 0.0 - 0.4: Expand & Rotate (Action)
  // 0.4 - 0.6: Hold (Rest)
  // 0.6 - 1.0: Contract (Reset)
  
  let animState = 0;
  if (progress < 0.4) {
    animState = easeInOutExpo(p.map(progress, 0, 0.4, 0, 1));
  } else if (progress < 0.6) {
    animState = 1;
  } else {
    animState = easeInOutExpo(p.map(progress, 0.6, 1.0, 1, 0));
  }

  // Continuous background rotation for flow
  let slowRot = p.millis() * 0.0002;
  p.rotate(slowRot);

  // --- INTERACTION ---
  // Mouse X creates 'tension', pulling the elements apart
  let tension = p.map(p.mouseX, 0, p.width, 0, 40);
  
  // --- GEOMETRY ---
  let numShapes = 4;
  let baseSize = 60;
  let expandDist = 40;
  
  // Bauhaus Palette (HSB)
  // Constructivist Red, Off-White, Deep Charcoal
  let cRed = p.color(5, 85, 90);
  let cDark = p.color(220, 20, 25);
  let cLight = p.color(40, 5, 95);

  for (let i = 0; i < numShapes; i++) {
    p.push();
    
    // Calculate rotation for this quadrant
    // We add a 90-degree snap during the expansion phase
    let baseAngle = (p.TWO_PI / numShapes) * i;
    let snapRotation = animState * (p.PI / 2);
    p.rotate(baseAngle + snapRotation);

    // Displacement logic
    // When animState is 1, shapes are pushed out. 
    // Tension adds a permanent offset.
    let currentDist = (expandDist * animState) + tension;
    
    // Draw Connector Lines (The 'Structure')
    // Only visible when expanded to emphasize the mechanics
    if (currentDist > 5) {
      p.stroke(cDark);
      p.strokeWeight(2);
      p.line(0, 0, currentDist, 0);
      p.noStroke();
    }

    // Move to position
    p.translate(currentDist, 0);

    // Shape Morphing
    // Square -> Circle -> Square
    // At rest (0), it's a square. Expanded (1), it rounds out.
    let currentRound = animState * (baseSize / 2);
    
    // Color Logic: Alternating for contrast
    if (i % 2 === 0) {
      p.fill(cRed);
    } else {
      p.fill(cLight);
    }

    // Draw the main block
    p.rect(0, 0, baseSize, baseSize, currentRound);
    
    // Inner detail (The 'Screw' head)
    // Rotates counter to the main shape to stay upright-ish
    p.fill(cDark);
    p.push();
      p.rotate(-(baseAngle + snapRotation));
      let screwSize = p.map(animState, 0, 1, 0, 8);
      if (screwSize > 1) {
        p.rect(0, 0, screwSize, 2);
        p.rect(0, 0, 2, screwSize);
      }
    p.pop();

    p.pop();
  }

  // --- CENTER HUB ---
  // A static anchor point
  p.fill(cDark);
  let centerSize = p.map(animState, 0, 1, 10, 20);
  p.ellipse(0, 0, centerSize, centerSize);
};

// --- EASING ---
// Exponential easing for a crisp, mechanical feel
function easeInOutExpo(x) {
  return x === 0
    ? 0
    : x === 1
    ? 1
    : x < 0.5
    ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2;
}