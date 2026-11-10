#!/usr/bin/env python3
"""Register resource files (fonts, text) under Jacked/Resources/Fonts in Jacked.xcodeproj. Idempotent.
   Tools/pbx-add-resource.py Jacked/Resources/Fonts/DMSans-Regular.ttf ..."""
import sys, os, re, hashlib
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pbx = os.path.join(root, "Jacked.xcodeproj", "project.pbxproj"); s = open(pbx).read()
uid = lambda t: hashlib.md5(t.encode()).hexdigest()[:24].upper()
FONTS = "021307FEA9633120DD28001C"; RES = "F2DDB37EAADEB3E2807282B6"  # RES = the Resources build phase

for rel in sys.argv[1:]:
    name = os.path.basename(rel)
    if f"/* {name} */ = {{isa = PBXFileReference" in s: continue
    fid, bid = uid("ref:" + rel), uid("build:" + rel)
    s = s.replace("/* End PBXFileReference section */", f"\t\t{fid} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = file; path = {name}; sourceTree = \"<group>\"; }};\n/* End PBXFileReference section */")
    s = s.replace("/* End PBXBuildFile section */", f"\t\t{bid} /* {name} in Resources */ = {{isa = PBXBuildFile; fileRef = {fid} /* {name} */; }};\n/* End PBXBuildFile section */")
    s = re.sub(r"(%s /\* Fonts \*/ = \{\s*isa = PBXGroup;\s*children = \(\n)" % FONTS, r"\g<1>" + f"\t\t\t\t{fid} /* {name} */,\n", s)
    s = re.sub(r"(%s /\* Resources \*/ = \{\s*isa = PBXResourcesBuildPhase;[^)]*?files = \(\n)" % RES, r"\g<1>" + f"\t\t\t\t{bid} /* {name} in Resources */,\n", s)
open(pbx, "w").write(s)
