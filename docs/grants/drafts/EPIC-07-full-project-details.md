# Epic MegaGrants: Full Project Details

**Portal prompt:** Describe your project and the next steps you plan to take towards development

**Limit:** 32,768 characters

**Approved by Austen:** August 30, 2026

**Portal text:**

I created the Kinetic Alphabet, a notation system for movements made with one handheld prop in each hand. It records how the hands travel between points around the performer and how the props rotate. Flow Arts Composer is the working browser application I built to write those movements down and animate them with 3D avatars. The resulting sequences can also be shared. The Kinetic Archive is the narrative museum game that turns the same system into a world a player can explore.

Flow arts is the practice of spinning staffs and other props in coordinated patterns around the body. In the game's fictional history, the Kinetic Alphabet has been embedded in human culture for 40,000 years and quietly documented by a bureaucratic organization that eventually collapses. Players explore its abandoned museum. They encounter historical practitioners portrayed by people from my Flow Arts community and gradually learn that the absurd archive contains a real tool for understanding choreography and creating it together.

Flow Arts Composer is my proof that the underlying system already works. Its 3D viewer lets someone move the camera around an avatar and change the playback speed instead of relying on a fixed two-dimensional video. The same application already contains stage tools and ongoing experiments in character walking. It has also exposed the problem this grant would solve.

The notation can tell the software where a hand and staff should arrive, but it does not know how a trained body gets them there. The avatars currently use inverse kinematics, a mathematical system for positioning limbs, to reach idealized hand targets. That system can put a hand on the correct grid point without knowing how the wrist should turn. It does not know when an elbow must move away from the torso so a staff can pass through the opening or how the fingers maintain their grip. When a staff circles behind the head, the system also needs to understand how a person moves out of its path. I have spent a great deal of time making miniature corrections until the result roughly resembles the intended movement. That process does not scale to the full vocabulary.

Epic funding would let me replace that guesswork with captured evidence. I would record body and hand motion together with tracked props for a bounded first set of double-staff techniques, meaning one short staff in each hand. Each take would be connected to its Kinetic Alphabet sequence and labeled to show prop contact, the body's route around the staff, foot support, and musical timing. Grant funds would cover the capture system, tracked-prop setup, performer sessions, data cleanup, and Unreal integration. Calibration and transferring the motion to differently proportioned avatars are part of that work because raw suit recordings are not a usable movement library by themselves.

Selected captures could become finished animations placed directly into museum scenes. The larger organized motion library would populate Unreal's Pose Search database, a searchable collection of recorded body poses. Motion Matching can then select the best recorded pose for the character's current and intended movement instead of requiring a separate animation for every scene. I will develop a search setup that considers the hands and intended prop path while also recording where each take falls within the beat. Unreal's in-engine Control Rig will handle small contact corrections. The IK Retargeter, which transfers animation between bodies, will test the same movement on avatars with different proportions. This is the production animation system that the current browser prototype does not have.

The funded milestone uses captured animation and Motion Matching. Once the library is large and varied enough, the same labeled examples can support later experiments in model-assisted motion generation. That research direction will build on a working Unreal implementation rather than determine whether the prototype succeeds.

The concrete result will be a three-room playable Unreal prototype. Each room will contain one interactive exhibit and a moving avatar. In the central interaction, the player can move freely around a performing avatar and slow the movement down. The task is to match a four-beat notation sequence to what the avatar is doing. At least one encounter will use capture-based double-staff movement instead of the browser viewer's current approximation. The prototype will show the complete path from written choreography to believable anatomical performance inside the fictional museum.

The game is one reason to build this system. The broader purpose is to map a young movement art that still survives largely through live teaching and short, flat videos. An interactive 3D performer lets someone inspect how a prop travels above or below the arm and around the head. Choreographers can use the same system to assemble shows before rehearsal. The project's GitHub repository will publish a motion format and representative sample clips containing the contact labels other developers need, while the complete cleaned capture library can remain separately licensable.

Flow Arts Composer is the foundation I have already built. Epic support would connect that working application to Unreal and give The Kinetic Archive its first playable rooms. Its avatars would finally gain movement knowledge that currently exists only in performers' bodies.
