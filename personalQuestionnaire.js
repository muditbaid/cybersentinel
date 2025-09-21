// --- Lifestyle Context Questions ---

"household-composition": {
    text: "Who do you share your home or devices with?",
    options: ["Living alone", "With partner/spouse", "With children", "With elderly parents", "Roommates"],
    category: "background",
    next: "primary-devices",
    patterns: {
        householdRisk: {
            "Living alone": 0,
            "With partner/spouse": 0,
            "With children": 2,
            "With elderly parents": 2,
            "Roommates": 1
        }
    }
},

"primary-devices": {
    text: "Which devices do you use most often?",
    options: ["Smartphone", "Laptop/Desktop", "Tablet", "Smart TV", "Gaming Console"],
    category: "background",
    next: "online-activities",
    patterns: {
        deviceDiversity: { 
            "Smartphone": 0, 
            "Laptop/Desktop": 0, 
            "Multiple devices": 1 
        }
    }
},

"online-activities": {
    text: "What do you spend most of your online time doing?",
    options: ["Social media & chatting", "Online shopping & banking", "Gaming & entertainment", "Dating apps", "Learning & hobbies"],
    category: "background",
    next: (answer) => {
        if (answer.includes("shopping")) return "shopping-security";
        if (answer.includes("gaming")) return "gaming-habits";
        if (answer.includes("dating")) return "dating-app-security";
        if (answer.includes("children")) return "parental-controls";
        return "social-media-habits";
    }
},

// --- Scenario-Based Questions ---

"shopping-security": {
    text: "When you see an amazing deal online, what’s your first instinct?",
    options: ["Buy immediately before it’s gone!", "Search for reviews first", "Check if the site looks professional", "Ask a friend if it’s legit"],
    category: "behavioral",
    next: "password-habits",
    patterns: {
        FOMO_Trigger: { 
            "Buy immediately before it’s gone!": 3, 
            "Search for reviews first": -1, 
            "Check if the site looks professional": -2, 
            "Ask a friend if it’s legit": -1 
        }
    }
},

"gaming-habits": {
    text: "Have you ever downloaded a mod, cheat, or ‘free currency’ tool for a game?",
    options: ["Yes, many times", "Once or twice", "I’ve considered it", "Never, too risky"],
    category: "behavioral",
    next: "device-security",
    patterns: {
        Gaming_Impulsivity: { 
            "Yes, many times": 3, 
            "Once or twice": 2, 
            "I’ve considered it": 1, 
            "Never, too risky": -2 
        }
    }
},

"dating-app-security": {
    text: "If someone you met online asks for money for an ’emergency,’ what would you do?",
    options: ["Send a small amount to help", "Ask for proof or video call", "Block and report them", "Not sure — I’d feel bad saying no"],
    category: "psychological",
    next: "social-media-habits",
    patterns: {
        Romance_Scam_Vulnerability: { 
            "Send a small amount to help": 3, 
            "Ask for proof or video call": -1, 
            "Block and report them": -2, 
            "Not sure — I’d feel bad saying no": 2 
        }
    }
},

"parental-controls": {
    text: "Do your children’s devices have parental controls or screen time limits?",
    options: ["Yes, strictly enforced", "Some limits in place", "No, they manage their own time", "I don’t have children"],
    category: "technical",
    next: "family-emergency-protocol",
    patterns: {
        Child_Risk: { 
            "Yes, strictly enforced": -2, 
            "Some limits in place": -1, 
            "No, they manage their own time": 2, 
            "I don’t have children": 0 
        }
    }
},

"family-emergency-protocol": {
    text: "If you get a call or text saying a family member is in the hospital and needs money, what’s your first move?",
    options: ["Send money immediately", "Call the family member directly", "Contact another relative to verify", "Ignore — could be a scam"],
    category: "psychological",
    next: "tech-support-scam",
    patterns: {
        Family_Trust_Exploit: { 
            "Send money immediately": 3, 
            "Call the family member directly": -2, 
            "Contact another relative to verify": -1, 
            "Ignore — could be a scam": 0 
        }
    }
},

"tech-support-scam": {
    text: "If you get a pop-up saying ‘Microsoft Support’ detected a virus on your PC, what would you do?",
    options: ["Call the number provided", "Close the pop-up and run my own antivirus", "Google how to remove the pop-up", "Panic and ask for help on social media"],
    category: "behavioral",
    next: "password-habits",
    patterns: {
        Tech_Support_Scam_Susceptibility: { 
            "Call the number provided": 3, 
            "Close the pop-up and run my own antivirus": -2, 
            "Google how to remove the pop-up": -1, 
            "Panic and ask for help on social media": 1 
        }
    }
}